// A recording stand-in for AudioContext: it satisfies synth.ts's structural
// CtxLike and keeps what the scheduler asked for so tests can assert on it.

export interface ParamCall {
  m: "set" | "lin" | "exp";
  v: number;
  t: number;
}

export interface FakeParam {
  value: number;
  calls: ParamCall[];
  setValueAtTime(v: number, t: number): FakeParam;
  linearRampToValueAtTime(v: number, t: number): FakeParam;
  exponentialRampToValueAtTime(v: number, t: number): FakeParam;
}

function param(): FakeParam {
  const p: FakeParam = {
    value: 0,
    calls: [],
    setValueAtTime(v, t) {
      p.calls.push({ m: "set", v, t });
      return p;
    },
    linearRampToValueAtTime(v, t) {
      p.calls.push({ m: "lin", v, t });
      return p;
    },
    exponentialRampToValueAtTime(v, t) {
      p.calls.push({ m: "exp", v, t });
      return p;
    },
  };
  return p;
}

export interface FakeSource {
  type: string;
  frequency: FakeParam;
  buffer: { getChannelData(c: number): Float32Array } | null;
  started: number[];
  stopped: number[];
  connect(d: unknown): void;
  start(t: number): void;
  stop(t: number): void;
}

export interface FakeGain {
  gain: FakeParam;
  connect(d: unknown): void;
}

export interface FakeCtx {
  currentTime: number;
  sampleRate: number;
  state: string;
  resumed: number;
  destination: { connect(d: unknown): void };
  oscillators: FakeSource[];
  noiseSources: FakeSource[];
  gains: FakeGain[];
  resume(): Promise<void>;
  createGain(): FakeGain;
  createOscillator(): FakeSource;
  createBiquadFilter(): { type: string; frequency: FakeParam; connect(d: unknown): void };
  createDynamicsCompressor(): {
    threshold: FakeParam;
    knee: FakeParam;
    ratio: FakeParam;
    attack: FakeParam;
    release: FakeParam;
    connect(d: unknown): void;
  };
  createBuffer(
    channels: number,
    length: number,
    rate: number,
  ): { getChannelData(c: number): Float32Array };
  createBufferSource(): FakeSource;
}

function source(): FakeSource {
  const s: FakeSource = {
    type: "sine",
    frequency: param(),
    buffer: null,
    started: [],
    stopped: [],
    connect() {},
    start(t) {
      s.started.push(t);
    },
    stop(t) {
      s.stopped.push(t);
    },
  };
  return s;
}

export function makeFakeCtx(): FakeCtx {
  const ctx: FakeCtx = {
    currentTime: 0,
    sampleRate: 8000,
    state: "running",
    resumed: 0,
    destination: { connect() {} },
    oscillators: [],
    noiseSources: [],
    gains: [],
    resume() {
      ctx.resumed++;
      return Promise.resolve();
    },
    createGain() {
      const g: FakeGain = { gain: param(), connect() {} };
      ctx.gains.push(g);
      return g;
    },
    createOscillator() {
      const o = source();
      ctx.oscillators.push(o);
      return o;
    },
    createBiquadFilter() {
      return { type: "lowpass", frequency: param(), connect() {} };
    },
    createDynamicsCompressor() {
      return {
        threshold: param(),
        knee: param(),
        ratio: param(),
        attack: param(),
        release: param(),
        connect() {},
      };
    },
    createBuffer(_channels, length) {
      return { getChannelData: () => new Float32Array(length) };
    },
    createBufferSource() {
      const s = source();
      ctx.noiseSources.push(s);
      return s;
    },
  };
  return ctx;
}
