/**
 * WebMIDI Service
 * 
 * Encapsulates Web MIDI API integration for detecting and capturing MIDI input events.
 * Handles device enumeration, connection management, and note event processing.
 */

export interface MidiPortInfo {
    id: string;
    name: string;
    manufacturer?: string;
    state: 'connected' | 'disconnected';
}

export interface MidiNoteEvent {
    type: 'note_on' | 'note_off';
    midi: number;
    velocity: number;
    timestamp: number;
}

export interface MidiServiceState {
    supported: boolean;
    accessGranted: boolean;
    ports: MidiPortInfo[];
    selectedPort: string | null;
    activePort: string | null;
    connected: boolean;
    error: string | null;
    pending: boolean;
}

type StateChangeCallback = (state: MidiServiceState) => void;
type NoteEventCallback = (event: MidiNoteEvent) => void;

export class WebMidiService {
    private midiAccess: MIDIAccess | null = null;
    private activeInput: MIDIInput | null = null;
    private state: MidiServiceState;
    private stateChangeCallbacks: StateChangeCallback[] = [];
    private noteEventCallbacks: NoteEventCallback[] = [];

    constructor() {
        this.state = {
            supported: this.isSupported(),
            accessGranted: false,
            ports: [],
            selectedPort: null,
            activePort: null,
            connected: false,
            error: null,
            pending: false,
        };
    }

    /**
     * Check if Web MIDI API is supported in the current browser
     */
    public isSupported(): boolean {
        return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
    }

    /**
     * Request MIDI access from the browser
     */
    public async requestAccess(): Promise<void> {
        if (!this.isSupported()) {
            this.updateState({
                error: 'Web MIDI API não é suportado neste navegador. Use Chrome, Edge ou Opera.',
            });
            return;
        }

        try {
            this.updateState({ error: null });

            // Request access without sysex (more permissive)
            this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });

            this.updateState({
                accessGranted: true,
                error: null,
            });

            // Listen for device state changes (hot-plug/unplug)
            this.midiAccess.onstatechange = this.handleStateChange;

            // Initial port enumeration
            this.enumeratePorts();

            console.log('[WebMIDI] Access granted');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Falha ao acessar MIDI';
            console.error('[WebMIDI] Access denied:', error);

            this.updateState({
                accessGranted: false,
                error: `Acesso MIDI negado: ${errorMessage}`,
            });
        }
    }

    /**
     * Get list of available MIDI input ports
     */
    public getAvailablePorts(): MidiPortInfo[] {
        return this.state.ports;
    }

    /**
     * Select and connect to a specific MIDI port
     */
    public selectPort(portId: string): void {
        if (!this.midiAccess) {
            console.warn('[WebMIDI] Cannot select port: MIDI access not granted');
            return;
        }

        const input = this.midiAccess.inputs.get(portId);

        if (!input) {
            console.warn(`[WebMIDI] Port ${portId} not found`);
            this.updateState({
                error: `Dispositivo não encontrado: ${portId}`,
            });
            return;
        }

        // Disconnect previous input if any
        if (this.activeInput) {
            this.activeInput.onmidimessage = null;
            console.log(`[WebMIDI] Disconnected from ${this.activeInput.name}`);
        }

        // Connect to new input
        this.activeInput = input;
        this.activeInput.onmidimessage = this.handleMidiMessage;

        this.updateState({
            selectedPort: portId,
            activePort: input.name || 'Unknown Device',
            connected: true,
            error: null,
        });

        console.log(`[WebMIDI] Connected to ${input.name || portId}`);
    }

    /**
     * Disconnect from the current MIDI port
     */
    public disconnectPort(): void {
        if (this.activeInput) {
            this.activeInput.onmidimessage = null;
            console.log(`[WebMIDI] Disconnected from ${this.activeInput.name}`);
            this.activeInput = null;
        }

        this.updateState({
            selectedPort: null,
            activePort: null,
            connected: false,
        });
    }

    /**
     * Get current service state
     */
    public getState(): MidiServiceState {
        return { ...this.state };
    }

    /**
     * Register callback for state changes.
     * Returns an unsubscribe function for cleanup.
     */
    public onStateChange(callback: StateChangeCallback): () => void {
        this.stateChangeCallbacks.push(callback);
        return () => {
            const idx = this.stateChangeCallbacks.indexOf(callback);
            if (idx !== -1) this.stateChangeCallbacks.splice(idx, 1);
        };
    }

    /**
     * Register callback for note events.
     * Returns an unsubscribe function for cleanup.
     */
    public onNoteEvent(callback: NoteEventCallback): () => void {
        this.noteEventCallbacks.push(callback);
        return () => {
            const idx = this.noteEventCallbacks.indexOf(callback);
            if (idx !== -1) this.noteEventCallbacks.splice(idx, 1);
        };
    }

    /**
     * Enumerate available MIDI input ports
     */
    private enumeratePorts(): void {
        if (!this.midiAccess) return;

        const ports: MidiPortInfo[] = [];

        this.midiAccess.inputs.forEach((input) => {
            ports.push({
                id: input.id,
                name: input.name || 'Unknown MIDI Device',
                manufacturer: input.manufacturer || undefined,
                state: input.state as 'connected' | 'disconnected',
            });
        });

        this.updateState({ ports });

        console.log(`[WebMIDI] Found ${ports.length} input device(s):`, ports.map(p => p.name));

        // Auto-select first port if only one is available and none is selected
        if (ports.length === 1 && !this.state.connected) {
            console.log('[WebMIDI] Auto-selecting single available device');
            this.selectPort(ports[0].id);
        }
    }

    /**
     * Handle MIDI device state changes (connect/disconnect)
     */
    private handleStateChange = (event: Event): void => {
        const midiEvent = event as MIDIConnectionEvent;

        console.log('[WebMIDI] State change:', {
            port: midiEvent.port.name,
            state: midiEvent.port.state,
            connection: midiEvent.port.connection,
        });

        // Re-enumerate ports
        this.enumeratePorts();

        // Check if active port was disconnected
        if (
            this.activeInput &&
            midiEvent.port.id === this.activeInput.id &&
            midiEvent.port.state === 'disconnected'
        ) {
            console.warn('[WebMIDI] Active device disconnected');
            this.disconnectPort();
            this.updateState({
                error: 'Dispositivo MIDI desconectado',
            });
        }
    };

    /**
     * Handle incoming MIDI messages
     */
    private handleMidiMessage = (event: MIDIMessageEvent): void => {
        const [status, data1, data2] = event.data;

        // Parse MIDI status byte
        const messageType = status & 0xf0;
        const channel = status & 0x0f;

        // We only care about Note On (0x90) and Note Off (0x80)
        if (messageType === 0x90 || messageType === 0x80) {
            const midi = data1; // Note number (0-127)
            const velocity = data2; // Velocity (0-127)

            // Note On with velocity 0 is equivalent to Note Off
            const isNoteOn = messageType === 0x90 && velocity > 0;

            const noteEvent: MidiNoteEvent = {
                type: isNoteOn ? 'note_on' : 'note_off',
                midi,
                velocity,
                timestamp: event.timeStamp,
            };

            // Emit to all registered callbacks
            this.noteEventCallbacks.forEach((callback) => {
                try {
                    callback(noteEvent);
                } catch (error) {
                    console.error('[WebMIDI] Error in note event callback:', error);
                }
            });
        }
        // Optionally handle other MIDI messages (CC, Program Change, etc.)
        // For now we ignore them
    };

    /**
     * Update internal state and notify callbacks
     */
    private updateState(partial: Partial<MidiServiceState>): void {
        this.state = { ...this.state, ...partial };

        // Notify all state change callbacks
        this.stateChangeCallbacks.forEach((callback) => {
            try {
                callback(this.getState());
            } catch (error) {
                console.error('[WebMIDI] Error in state change callback:', error);
            }
        });
    }
}
