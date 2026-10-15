// LIFF endpoint: liff.line.me/<id>/<path> first lands here, and LIFF's init
// (in the layout) forwards to the real /m/<path> page.
export default function MiniHome() {
  return <p className="p-6 text-center text-sm text-muted-foreground">載入中…</p>;
}
