# Group library

`group.frglib.json` ships with the editor. Everyone in the group sees its field types and
templates under **Library…**, and its templates appear in the palette's *Diagrams* list.

To add something, open a merge request:

1. In the editor, draw the diagram, select it and click **Save as template**.
   New field and vertex types can be added under **Lines & vertices…**.
2. Choose **Library… → Export my library** to get a `.frglib.json`.
3. Copy the entries you want to share from that file into `group.frglib.json`:
   - templates go in `templates`;
   - field types go in `fields` and vertex types in `vertexTypes`, with ids that don't clash
     with existing ones.
