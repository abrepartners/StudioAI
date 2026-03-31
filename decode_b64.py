#!/usr/bin/env python3
import base64, sys
# Read base64 from stdin and write decoded content to file
data = sys.stdin.read().strip()
with open(sys.argv[1], 'wb') as f:
    f.write(base64.b64decode(data))
print(f"Wrote {len(base64.b64decode(data))} bytes to {sys.argv[1]}")
