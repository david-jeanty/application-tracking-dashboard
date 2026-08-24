/**
 * The IANA timezone every "what day is it" decision uses, until profiles carry
 * one of their own.
 *
 * The architecture plan is explicit that a zone must not be hardcoded into
 * domain logic, so no calculation reads this constant: the pure dashboard
 * functions take an already-resolved `today` string. Only the server page that
 * resolves "today" once, and the timestamp formatter, refer to it — which is
 * what makes swapping it for `profiles.time_zone` later a one-line change
 * rather than an audit.
 *
 * It is a documented fallback rather than a claim about the student. A
 * server-rendered page cannot read the browser's zone without a round trip,
 * and guessing UTC would show a Toronto student tomorrow's date all evening.
 */
export const DEFAULT_TIME_ZONE = "America/Toronto";
