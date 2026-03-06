# Viewer

## Viewer Pipeline V1/V2
- `schema_version` is the only routing key.
- **V1 (Legacy)**: Monophonic, consumes `notes` only.
- **V2 (Polyphonic)**: Consumes `steps` which contain `notes[]` (chords).
    - **Engine**: `LessonEngineV2` handles polyphonic state, scoring, and `ActiveStepState`.
    - **Cursor Mapping**: `buildV2StepToCursorMapping` maps each *step* (chord) to a specific OSMD cursor position, ensuring precise advancements in Film Mode.
    - **Film Mode**: Logic optimized for V2 to advance cursor per step index, handle polyphonic hits with adjusted timing windows, and prevent jitter.
- **Engines**: Completely split (`createEngineV1` / `createEngineV2`) to avoid shared state issues.
- **Data Source**: Fetches content via REST API (`/catalog`, `/lessons/{id}`) ensuring reliable loading before playback.
- **Rendering**: UI-only render notes for V2 are derived from steps for piano roll and beat-to-x mapping.
