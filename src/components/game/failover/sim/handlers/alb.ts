// The load balancer has no job logic of its own: it spreads work round-robin
// across the routable services wired downstream of it.
export { genericForward as process } from "./forward";
