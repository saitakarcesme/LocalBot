# LocalBot Connect routing service

This service forwards opaque, authenticated AES-GCM envelopes to a LocalBot host's outbound Cloudflare tunnel. It never receives encryption keys. It handles bearer capabilities in transit, so encrypted-payload validation at the host remains mandatory. No prompts, outputs or credentials are logged by this code.

Hosts publish a short-lived tunnel address signed by a persistent Ed25519 host key. The routing ID is SHA-256 of the public key, so another host cannot claim it. The cache holds only expiring routing metadata. Identity, device credentials, chats and model state remain on the host. Routes are renewed every minute; eviction or an offline host produces a temporary 503, not data loss. One region avoids inconsistent regional lookups.

Limits: 3.5 MB encrypted requests, 4 MB encrypted responses, 110-second upstream deadline. No streaming/SSE. This is a connection preview, not a production SLA. Availability still depends on Cloudflare tunnels, the Mac/model PC staying online, and the hosting plan's quotas. Add platform rate limiting and operational monitoring before public multi-user rollout. Do not expose this as an unrestricted public service.
