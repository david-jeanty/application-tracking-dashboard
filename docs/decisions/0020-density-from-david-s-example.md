# 0020: Page density matches David's example: 90% two-liners, line height fills the rest

**Context.** David's example resume (zero2sudo, US Letter, 0.45" margins, Tinos 9 pt) fills to within 0.5" of the bottom, with full bullet lines of about 130 to 142 characters and two-liners of 255 to 280. Measured against the builds: the font, size and margins are the same as the base resume the builds copy, and calibration's line length (130, median about 137) matches. Two things differ. Calibration let a two-liner start at 80% of its last line (240 characters), so builds packed less text per bullet. And the example's CSS sets `li, p { line-height: 1.24 }` where the base has 1.2: David tunes line height per resume (1.18, 1.24, 1.27) to fill the page. Measured on a real page, 1.2 to 1.3 closes about 4% of the page height, so line height can finish filling a page but not do it alone.

**Decision.** Before the build, two-liners aim for a last line 90% full (`TWO_LINE_TARGET_FILL`; zero2sudo about 254 to 275). Chrome's check stays at 80%. In the build, after bullets are added or cut, the remaining gap is closed by tuning `li, p { line-height }` between 1.15 and 1.30, on the resume this build created only (resume.lol's update accepts CSS; the base resume is still never written, and a rebuild never sends CSS, so David's own design changes survive). A page just over one page is tightened the same way before any bullet below David's counts is cut.

**Alternatives.** Change the base resume's CSS (it is David's design, and one fixed line height cannot fit every resume's content). Smaller margins or font (would not match the example).

**Why.** It is the same lever David pulls by hand, applied to what is left after the content is right.
