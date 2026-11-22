// Serving a single byte range lets mobile media players seek the public sample.
export function sampleAudioResponse(bytes, range) {
  const length = bytes.byteLength;
  const headers = {
    'Accept-Ranges': 'bytes',
    'Content-Type': 'audio/mpeg',
    'Content-Length': String(length),
  };
  const match = range?.trim().match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || (!match[1] && !match[2])) return { status: 200, headers, body: bytes };

  const start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]));
  const end = !match[1] || !match[2] ? length - 1 : Math.min(Number(match[2]), length - 1);
  if (start >= length || start > end) {
    return {
      status: 416,
      headers: { ...headers, 'Content-Length': '0', 'Content-Range': 'bytes */' + length },
      body: null,
    };
  }
  const body = bytes.subarray(start, end + 1);
  return {
    status: 206,
    headers: { ...headers, 'Content-Length': String(body.byteLength), 'Content-Range': `bytes ${start}-${end}/${length}` },
    body,
  };
}
