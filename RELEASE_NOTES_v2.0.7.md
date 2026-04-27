# TeacherPro v2.0.7

## Bug Fixes

### Material Link Context Menu (Actually Fixed)
- **Fixed material link right-click menu** — The editor's context menu handler was intercepting all right-click events, preventing the material link's menu from appearing. Now the editor detects when you're right-clicking on a material link and allows it to show its own menu.

## What's Changed

| Status | Description |
|--------|-------------|
| Fixed  | Material link right-click context menu now works correctly by letting the MaterialLink component handle its own events |

## Full Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the complete version history.
