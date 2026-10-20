"""Builds the opener's soundtrack: edited music bed + synthesized sound design, mastered to -14 LUFS.

    ~/.cache/t2t-pitch-audio/venv/bin/python audio.py   → out/soundtrack.wav, out/music.wav, out/sfx.wav

Music: "Vanguard" by Scott Buckley, released under CC BY 4.0 (www.scottbuckley.com.au).
The video's cuts sit on this track's bar grid (133⅓ BPM, 1.8 s bars). Three pieces, no repeats:
v = m − 10.111 (intro build), m − 26.311 from 41.8 (break, melodic middle), m − 91.111 from 58.0
(closing section, entering under Drop Zone's low-pass). Hits land on WHO'S READY (2.2), the logo (13.0),
WHAT'S NEXT (45.4), READINESS (129.96) and the end logo (135.53).
"""
from pathlib import Path

import librosa
import numpy as np
import pyloudnorm
import soundfile as sf
from pedalboard import Compressor, HighpassFilter, HighShelfFilter, Limiter, PeakFilter, Pedalboard, Reverb
from scipy.signal import butter, sosfilt

SR = 48000
DUR = 140.0
HERE = Path(__file__).parent
OUT = HERE / 'out'
OUT.mkdir(exist_ok=True)
rng = np.random.default_rng(7)


def n(sec):
    return int(round(sec * SR))


def db(x):
    return 10 ** (x / 20)


def filt(x, kind, f, order=4):
    return sosfilt(butter(order, f, kind, fs=SR, output='sos'), x)


def norm(x, peak_db):
    return x / (np.max(np.abs(x)) + 1e-12) * db(peak_db)


def svf(x, cutoff, q=0.7, mode='bp'):
    """Time-varying TPT state-variable filter; cutoff is an array (Hz) per sample."""
    g = np.tan(np.pi * np.clip(cutoff, 20, SR * 0.45) / SR)
    k = 1 / q
    ic1 = ic2 = 0.0
    y = np.empty_like(x)
    for i in range(len(x)):
        gi = g[i]
        a1 = 1 / (1 + gi * (gi + k))
        v3 = x[i] - ic2
        v1 = a1 * ic1 + gi * a1 * v3
        v2 = ic2 + gi * v1
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        y[i] = v1 if mode == 'bp' else v2
    return y


def stereo(x, pan=0.0, width=0.0):
    """Equal-power pan (-1..1); width adds a short decorrelated copy for size."""
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    out = np.stack([x * l, x * r])
    if width:
        d = n(0.011)
        out[1, d:] = out[1, d:] * (1 - width) + x[:-d] * r * width
    return out


def reverb(st, room=0.8, wet=0.3, dry=1.0, damp=0.5, tail=2.0):
    st = np.concatenate([st, np.zeros((2, n(tail)))], axis=1).astype(np.float32)
    return Pedalboard([Reverb(room_size=room, wet_level=wet, dry_level=dry, damping=damp, width=1.0)])(st, SR)


# ---------------------------------------------------------------- sound design
def boom(size=1.0, f0=110, f1=34, tau=0.9, crack=0.35):
    t = np.arange(n(3.2 * size)) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.12)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (tau * size)) * np.minimum(1, t / 0.003)
    body = filt(rng.standard_normal(len(t)), 'lowpass', 280) * np.exp(-t / 0.22) * 0.9
    snap = filt(rng.standard_normal(len(t)), 'highpass', 1800) * np.exp(-t / 0.035) * crack
    x = np.tanh(1.6 * (sub + body + snap))
    return reverb(stereo(x, width=0.6), room=0.92, wet=0.32, damp=0.4, tail=2.5)


def whoosh(dur=0.6, f0=250, f1=5000, pan=(-0.6, 0.6), peak=0.7, q=1.2):
    t = np.arange(n(dur)) / SR
    p = t / dur
    cutoff = f0 * (f1 / f0) ** p
    x = svf(rng.standard_normal(len(t)), cutoff, q)
    env = np.where(p < peak, (p / peak) ** 2, ((1 - p) / (1 - peak)) ** 1.5)
    x *= env
    pans = np.interp(p, [0, 1], pan)
    st = np.stack([x * np.cos((pans + 1) * np.pi / 4), x * np.sin((pans + 1) * np.pi / 4)])
    return reverb(st, room=0.6, wet=0.18, tail=0.8)


def riser(dur=2.6):
    t = np.arange(n(dur)) / SR
    p = t / dur
    noise = svf(rng.standard_normal(len(t)), 180 * (9000 / 180) ** (p ** 1.4), 2.5) * p ** 2.2
    f = 70 * (640 / 70) ** (p ** 1.6) * (1 + 0.012 * np.sin(2 * np.pi * 6 * t))
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR)
    tone = (tone + 0.35 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR)) * p ** 2.5 * 0.5
    st = stereo(noise * 1.2 + tone, width=0.7)
    return reverb(st, room=0.85, wet=0.25, tail=0.3)[:, : len(t) + n(0.05)]


def click(freq=2600, tau=0.008, body=0.5):
    t = np.arange(n(0.06)) / SR
    burst = filt(rng.standard_normal(len(t)), 'highpass', 2000) * np.exp(-t / 0.0015)
    ring = np.sin(2 * np.pi * freq * t) * np.exp(-t / tau)
    thunk = np.sin(2 * np.pi * 650 * t) * np.exp(-t / 0.004) * body
    return stereo(burst * 0.6 + ring + thunk)


def key(level=1.0):
    t = np.arange(n(0.04)) / SR
    x = filt(rng.standard_normal(len(t)), 'bandpass', [1400, 6500]) * np.exp(-t / 0.004)
    x += np.sin(2 * np.pi * rng.uniform(180, 260) * t) * np.exp(-t / 0.006) * 0.6
    return stereo(x * level * rng.uniform(0.7, 1.0), pan=rng.uniform(-0.2, 0.2))


def pop(pan=0.0):
    t = np.arange(n(0.25)) / SR
    f = 90 + 120 * np.exp(-t / 0.02)
    thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.05)
    air = filt(rng.standard_normal(len(t)), 'bandpass', [700, 3500]) * np.exp(-t / 0.018) * 0.5
    return reverb(stereo(thump + air, pan=pan), room=0.5, wet=0.15, tail=0.4)


def slap(pan=0.0):
    t = np.arange(n(0.2)) / SR
    x = filt(rng.standard_normal(len(t)), 'bandpass', [450, 4500]) * np.exp(-t / 0.035)
    x += np.sin(2 * np.pi * 120 * t) * np.exp(-t / 0.03) * 0.8
    return reverb(stereo(x, pan=pan), room=0.4, wet=0.12, tail=0.3)


def bell(freq, dur=1.6, partials=((1, 1, 1.0), (2.0, 0.45, 0.6), (3.01, 0.25, 0.35), (4.2, 0.15, 0.2))):
    t = np.arange(n(dur)) / SR
    x = sum(a * np.sin(2 * np.pi * freq * m * t) * np.exp(-t / (d * dur)) for m, a, d in partials)
    return x * np.minimum(1, t / 0.002)


def chime(freqs, gap=0.07, dur=1.4, pan=0.0):
    x = np.zeros(n(dur + gap * len(freqs)))
    for i, f in enumerate(freqs):
        b = bell(f, dur)
        x[n(i * gap): n(i * gap) + len(b)] += b
    return reverb(stereo(x, pan=pan, width=0.5), room=0.75, wet=0.35, tail=1.5)


def blip(freq):
    t = np.arange(n(0.04)) / SR
    x = (np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * 3 * freq * t)) * np.sin(np.pi * t / t[-1]) ** 2
    return stereo(x, pan=rng.uniform(-0.3, 0.3))


def tonal_hit(freq=73.4):
    t = np.arange(n(1.6)) / SR
    f = freq + 60 * np.exp(-t / 0.03)
    low = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.35)
    metal = bell(freq * 8, 1.0, ((1, 0.25, 0.3), (2.76, 0.12, 0.2), (5.4, 0.06, 0.1)))
    metal = np.pad(metal, (0, len(t) - len(metal)))
    snap = filt(rng.standard_normal(len(t)), 'highpass', 2500) * np.exp(-t / 0.02) * 0.3
    return reverb(stereo(np.tanh(1.3 * (low + metal + snap)), width=0.5), room=0.8, wet=0.25, tail=1.2)


def shimmer():
    x = sum(bell(f, 4.0, ((1, 1, 0.9), (2.0, 0.3, 0.5))) * a for f, a in ((587.3, 0.6), (880, 0.5), (1174.7, 0.4), (1760, 0.25)))
    return reverb(stereo(x, width=0.8), room=0.95, wet=0.5, dry=0.6, damp=0.3, tail=3.0)


sfx = np.zeros((2, n(DUR + 4)))


def put(sound, at, level_db):
    s = norm(sound, level_db)
    i = n(at)
    j = min(sfx.shape[1], i + s.shape[1])
    sfx[:, i:j] += s[:, : j - i]


# Cold open: typing, the headline wipe, WHO'S READY
for k in range(22):
    put(key(), 0.2 + k * 0.8 / 22 + rng.uniform(-0.008, 0.008), -27)
put(whoosh(0.5, 400, 6000, (-0.8, 0.4)), 0.75, -20)
put(boom(1.0, f0=120, f1=38), 2.2, -4)

# Chaos: windows, stickies, message pings, racing clock, caption hit, riser into the logo
for i in range(10):
    put(pop(pan=rng.uniform(-0.7, 0.7)), 4.15 + i * 0.4, -16)
for at in (4.95, 6.95):
    put(chime([1568, 2093], gap=0.09, dur=0.5), at + 0.05, -21)
for i in range(3):
    put(slap(pan=rng.uniform(-0.6, 0.6)), 5.0 + i * 1.2, -15)
t, k = 4.3, 0
while t < 12.3:
    put(click(2600 if k % 2 == 0 else 2150, body=0.4), t, -21 + 3 * (t - 4.3) / 8)
    t += 1 / (1.6 + 8.5 * ((t - 4.3) / 8) ** 1.8)
    k += 1
put(boom(0.8, f0=100, f1=40, crack=0.2), 7.6, -9)
put(riser(2.55), 10.3, -12)
put(whoosh(0.5, 6000, 300, (0.5, -0.5), peak=0.85), 12.35, -14)
put(boom(1.4, f0=130, f1=30, tau=1.2, crack=0.5), 13.0, -1.5)

# Available today: cut whooshes
for at in (16.6, 20.2, 23.8, 27.4):
    put(whoosh(0.45, 300, 7000), at - 0.35, -17)

# Scoped access: entrance, dots, zoom steps, caption on the break
put(boom(0.7, f0=90, f1=40, crack=0.15), 31.0, -11)
for i in range(14):
    put(click(rng.uniform(3200, 4200), tau=0.012, body=0.1), 31.1 + rng.uniform(0, 0.75), -30)
for at in (33.7, 36.4, 39.1):
    put(whoosh(0.55, 120, 1600, (0.3, -0.3), q=0.9), at - 0.3, -15)
    put(blip(1760), at + 0.2, -24)
put(tonal_hit(55), 41.8, -10)

# What's next (the music's re-entry) / Personnel details
put(boom(1.0, f0=110, f1=36, crack=0.3), 45.4, -5)
put(shimmer(), 45.45, -20)
for at in (49.0, 53.5):
    put(whoosh(0.45, 300, 7000, (0.6, -0.6)), at - 0.35, -17)

# Drop Zone (starts 58.0: Robert speaks 58.7–64.7, parse 64.8, approve 69.4)
put(whoosh(0.6, 500, 9000, (-0.5, 0.5)), 57.6, -16)
put(chime([880, 1318.5], gap=0.12, dur=0.9), 58.3, -18)
for i in range(9):
    put(blip(rng.choice([1320, 1568, 1760, 2093, 2349])), 64.8 + i * 0.075, -25)
for i in range(3):
    put(pop(pan=0.4), 65.5 + i * 0.4, -18)
put(click(1800, tau=0.004, body=0.9), 69.35, -14)
put(chime([1046.5, 1318.5, 1568, 2093], gap=0.06, dur=1.4), 69.45, -13)
for i in range(3):
    put(tonal_hit(98), 69.65 + i * 0.18, -17)
put(boom(1.0, f0=110, f1=36, crack=0.3), 70.6, -6)

# Events & Taskings
for at in (74.2, 78.7):
    put(whoosh(0.45, 300, 7000), at - 0.35, -17)

# AI: one hit per verb (two bars each), then the recap
for i, f in enumerate((55, 61.7, 65.4, 73.4)):
    put(tonal_hit(f), 83.2 + i * 3.6, -8)
put(boom(0.7, f0=95, f1=42, crack=0.15), 83.2, -12)
put(boom(0.8, f0=100, f1=40, crack=0.2), 97.6, -9)
for i in range(4):
    put(click(1500 + 300 * i, tau=0.01, body=0.6), 97.6 + i * 0.225, -16)

# Bookend (starts 99.4): the opening's typing and question, then the dashboard answers it
for k in range(22):
    put(key(), 99.5 + k * 0.8 / 22 + rng.uniform(-0.008, 0.008), -27)
put(boom(1.0, f0=120, f1=38), 101.2, -6)
put(whoosh(0.5, 6000, 300, (0.5, -0.5), peak=0.85), 102.55, -14)
put(boom(1.4, f0=130, f1=30, tau=1.2, crack=0.5), 103.0, -3)
put(shimmer(), 103.05, -16)

# Testimonials (starts 110.2): each quote's lines stamp down two beats apart
for qi, q0 in enumerate((110.2, 114.7, 119.2)):
    put(tonal_hit((55, 61.7, 73.4)[qi]), q0, -10)
    for k in range(3):
        put(boom(0.55 if k else 0.8, f0=95, f1=42, crack=0.3), q0 + k * 0.9, -9 if k else -7)
        put(click(1400, tau=0.006, body=0.8), q0 + k * 0.9, -17)

# Close (starts 124.6): lines, the drop, READINESS at 129.96, tagline, the logo on the final hit at 135.53
for at in (124.7, 125.6):
    put(whoosh(0.4, 300, 5000, (-0.4, 0.4)), at - 0.15, -21)
put(riser(1.1), 128.86, -15)
put(boom(1.5, f0=140, f1=30, tau=1.3, crack=0.55), 129.96, -1)
for i in range(3):
    put(blip(880 * (1.5 ** i)), 131.76 + i * 0.9, -24)
put(boom(1.2, f0=100, f1=32, tau=1.4, crack=0.25), 135.53, -5)
put(shimmer(), 135.58, -14)

# ---------------------------------------------------------------- music bed
# Three bar-aligned pieces of Vanguard, no repeats: the intro build, the break and melodic middle,
# and the closing section through the composer's own ending. Downbeats sit 37 ms before the
# analysis grid (1.548 + 1.8k), so the offsets land them on the video's bar lines.
y, msr = librosa.load(HERE / 'assets/music/scott-buckley-vanguard.mp3', sr=SR, mono=False)
PIECES = [(0.0, 10.111), (41.8, 26.311), (58.0, 91.111)]  # (video start, music − video offset)
xf = n(0.025)
music = np.zeros((2, sfx.shape[1]))
for i, (v0, off) in enumerate(PIECES):
    v1 = PIECES[i + 1][0] if i + 1 < len(PIECES) else DUR + 4
    a, b = n(v0 - 0.035), n(v1 - 0.01)  # each piece hands over 35–10 ms before the downbeat
    a = max(a, 0)
    seg = y[:, n(off) + a: n(off) + b]
    seg = np.pad(seg, ((0, 0), (0, max(0, b - a - seg.shape[1]))))
    env = np.ones(b - a)
    if i:
        env[:xf] = np.sqrt(np.linspace(0, 1, xf))
    if i + 1 < len(PIECES):
        env[-xf:] = np.sqrt(np.linspace(1, 0, xf))
    music[:, a:b] += seg * env
music[:, : n(0.3)] *= np.linspace(0, 1, n(0.3)) ** 2  # starts mid-intro

# Drop Zone: the music drops behind a wall while the leader speaks, then opens as the changes land
keys = [57.9, 58.35, 64.75, 65.5]
r0, r1 = n(keys[0]), n(keys[-1] + 0.3)
tt = np.arange(r1 - r0) / SR + keys[0]
cut = np.exp(np.interp(tt, keys, np.log([18000, 520, 520, 18000])))
gain = np.interp(tt, keys, [1, db(-5), db(-5), 1])
for ch in range(2):
    music[ch, r0:r1] = svf(music[ch, r0:r1].astype(np.float64), cut, q=0.9, mode='lp') * gain

# Bookend: the music muffles under the callback, then opens on the dashboard's downbeat (103.0)
keys = [99.35, 99.7, 102.8, 103.0]
r0, r1 = n(keys[0]), n(keys[-1] + 0.05)
tt = np.arange(r1 - r0) / SR + keys[0]
cut = np.exp(np.interp(tt, keys, np.log([18000, 700, 700, 18000])))
gain = np.interp(tt, keys, [1, db(-4), db(-4), 1])
for ch in range(2):
    music[ch, r0:r1] = svf(music[ch, r0:r1].astype(np.float64), cut, q=0.9, mode='lp') * gain

# fade the ending's tail under the end card
f0, f1 = n(138.4), n(DUR)
music[:, f0:f1] *= np.linspace(1, 0, f1 - f0) ** 1.5
music[:, f1:] = 0

# ---------------------------------------------------------------- voice
# Robert's Drop Zone line: trimmed, cleaned up, a little room, placed so his first word lands at 58.7.
VOICE_AT = 58.16
v, _ = librosa.load(HERE / 'assets/voice/drop-zone-robert.wav', sr=SR, mono=True)
v = v[n(0.4): n(6.75)]
v[: n(0.08)] *= np.linspace(0, 1, n(0.08))
v[-n(0.15):] *= np.linspace(1, 0, n(0.15))
v = Pedalboard([HighpassFilter(85), PeakFilter(220, -2.5, 1.0), PeakFilter(3800, 2.5, 0.8), HighShelfFilter(9000, 1.5),
                Compressor(threshold_db=-24, ratio=3.0, attack_ms=6, release_ms=90)])(v.astype(np.float32), SR)
v = reverb(stereo(v.astype(np.float64)), room=0.25, wet=0.07, dry=1.0, damp=0.6, tail=0.6)
voice = np.zeros_like(sfx)
voice[:, n(VOICE_AT + 0.4): n(VOICE_AT + 0.4) + v.shape[1]] = v
meter = pyloudnorm.Meter(SR)
voice *= db(-15 - meter.integrated_loudness(v.T))

# ---------------------------------------------------------------- mix + master
music *= db(-16 - meter.integrated_loudness(music.T))


def master_of(mix):
    """Glue compression, then a limiter, converged on -14 LUFS with a -1 dBFS ceiling."""
    mix = mix[:, : n(DUR)].copy()
    mix[:, -n(0.6):] *= np.linspace(1, 0, n(0.6)) ** 2
    glue = Pedalboard([Compressor(threshold_db=-20, ratio=2.2, attack_ms=15, release_ms=220)])(mix.astype(np.float32), SR)

    def finish(pre_lufs):
        # JUCE's limiter outputs at 0 dBFS, so drop 1 dB afterwards for the ceiling
        x = glue * db(pre_lufs - meter.integrated_loudness(glue.T))
        return Pedalboard([Limiter(threshold_db=-3.0, release_ms=120)])(x.astype(np.float32), SR) * db(-1.0)

    pre = -18.0
    for _ in range(4):
        pre += -14 - meter.integrated_loudness(finish(pre).T)
    return finish(pre)


for name, mix in (('soundtrack', music + voice + sfx * db(-3)), ('soundtrack-music-only', music + voice)):
    master = master_of(mix)
    sf.write(OUT / f'{name}.wav', master.T, SR, subtype='PCM_24')
    print(f'{name}: {meter.integrated_loudness(master.T):.1f} LUFS, peak {20 * np.log10(np.abs(master).max()):.2f} dBFS')
sf.write(OUT / 'music.wav', music[:, : n(DUR)].T, SR, subtype='PCM_24')
sf.write(OUT / 'sfx.wav', norm(sfx[:, : n(DUR)], -1).T, SR, subtype='PCM_24')
sf.write(OUT / 'voice.wav', voice[:, : n(DUR)].T, SR, subtype='PCM_24')
