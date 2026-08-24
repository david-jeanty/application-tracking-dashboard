# JobTrack Visual Design Spec

**Constraint:** JobTrack is a student portfolio project, not a startup. This redesign is a presentation-layer refactor. It should not create new backend systems merely to support visual polish.

## Signature motifs
- **JobTrack Record:** logo -> company -> role -> context.
- **Lifecycle Rail:** Saved -> Applied -> In process -> Interview -> Outcome. The exact ten-status model remains text/data; the rail is a coarse visual summary.
- **Accent Ink:** Blue/Rose/Violet/Emerald accents affect interaction, lifecycle, selection, focus, and neutral data bars. Semantic status colors stay stable.

## Screen specs

### 01 Dashboard
Needs Attention is the visual hero. Search summary, pipeline, this-week metrics, and activity are compact and divided mostly by whitespace/rules instead of generic dashboard cards.

### 02 Applications
The primary working surface. Dense enough for 20-50 applications. Employer/role dominates; compact Lifecycle Rail provides job-specific scanability. Filters stay close to the list.

### 03 Application detail
Strongest expression of JobTrack identity. Employer/role hero, full Lifecycle Rail, visible next action, restrained overview, and simple status history. No invented MCP actor labels unless provenance is actually stored.

### 04 Add application
Quiet 700-760px form. Sections use headings, spacing, and rules. No card around every field group.

### 05 Pipeline
Compact board. Cards show company, role, and one useful contextual item. Do not repeat the full Lifecycle Rail inside cards because the column already communicates stage. Mobile should use vertical stage groups.

### 06 Analytics
Preserve Phase 3B calculations. Inline metrics and bars; source performance remains a readable table. Accent controls neutral visualization ink only.

### 07 Archive
Reuse the Applications record anatomy but mute it. Lifecycle remains useful because terminal status alone does not show how far an application progressed.

### 08 Settings
System/Light/Dark plus Blue/Rose/Violet/Emerald accents. Connected assistants remain normal settings rows, not AI-gradient cards.

### 09 Authentication
Minimal task-focused form. Demo access is more valuable than illustration or marketing decoration.

### 10 Demo workspace
Believable sample data and normal JobTrack interactions. Persistent demo banner makes simulation explicit. The demo should show why the product is better than a spreadsheet through use, not marketing copy.

### 11-12 Mobile
Recompose rather than shrink desktop. Applications become stacked records; Lifecycle Rail remains. Detail becomes single-column.

### 13-14 Themes
Dark + Violet and Light + Rose demonstrate that themes change mood, not structure. Semantic outcome colors remain independent from accent.

## Implementation order
1. Theme/design tokens + shell.
2. Applications/detail/forms/archive + Lifecycle Rail.
3. Dashboard/analytics/settings/auth/demo + responsive QA.
4. Pipeline stays the next functional phase rather than being hidden inside the visual-refactor PR.
