// Một tiếng bíp ngắn bằng WebAudio, không cần file âm thanh.
// Không kêu được (trình duyệt chặn âm thanh) thì thôi, bảng nhắc vẫn hiện.
let ctx: AudioContext | null = null;

export const beep = () => {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // Nuốt lỗi cố ý: tiếng bíp chỉ là phụ, nhắc hẹn vẫn hiện bảng.
  }
};
