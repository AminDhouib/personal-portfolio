// A recording stand-in for AudioContext: it satisfies synth.ts's structural
// CtxLike and keeps what the scheduler asked for so tests can assert on it.

export interface ParamCall {
  m: "set" | "lin" | "exp" | "cancel";
  v: number;
  t: number;
}

export interface FakeParam {
  value: number;
  calls: ParamCall[];
  setValueAtTime(v: number, t: number): FakeParam;
  linearRampToValueAtTime(v: number, t: number): FakeParam;
  exponentialRampToValueAtTime(v: number, t: number): FakeParam;
  cancelScheduledValues(t: number): FakeParam;
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
    cancelScheduledValues(t) {
      p.calls.push({ m: "cancel", v: 0, t });
      return p;
    },
  };
  return p;
}

interface Disconnectable {
  disconnected: number;
  connect(d: unknown): void;
  disconnect(): void;
}

function node<T extends object>(extra: T): T & Disconnectable {
  const n: T & Disconnectable = {
    ...extra,
    disconnected: 0,
    connect() {},
    disconnect() {
      n.disconnected++;
    },
  };
  return n;
}

export interface FakeSource extends Disconnectable {
  type: string;
  frequency: FakeParam;
  buffer: { getChannelData(c: number): Float32Array } | null;
  started: number[];
  stopped: number[];
  onended: ((ev: Event) => void) | null;
  start(t: number): void;
  stop(t: number): void;
}

export interface FakeGain extends Disconnectable {
  gain: FakeParam;
}

export interface FakeFilter extends Disconnectable {
  type: string;
  frequency: FakeParam;
}

export interface FakeCtx {
  currentTime: number;
  sampleRate: number;
  state: string;
  resumed: number;
  closed: number;
  close(): Promise<void>;
  destination: Disconnectable;
  oscillators: FakeSource[];
  noiseSources: FakeSource[];
  gains: FakeGain[];
  filters: FakeFilter[];
  resume(): Promise<void>;
  createGain(): FakeGain;
  createOscillator(): FakeSource;
  createBiquadFilter(): FakeFilter;
  createDynamicsCompressor(): Disconnectable & {
    threshold: FakeParam;
    knee: FakeParam;
    ratio: FakeParam;
    attack: FakeParam;
    release: FakeParam;
  };
  createBuffer(
    channels: number,
    length: number,
    rate: number,
  ): { getChannelData(c: number): Float32Array };
  createBufferSource(): FakeSource;
}

function source(): FakeSource {
  const s: FakeSource = node<Omit<FakeSource, keyof Disconnectable>>({
    type: "sine",
    frequency: param(),
    buffer: null,
    started: [],
    stopped: [],
    onended: null,
    start(t) {
      s.started.push(t);
    },
    stop(t) {
      s.stopped.push(t);
    },
  });
  return s;
}

export function makeFakeCtx(): FakeCtx {
  const ctx: FakeCtx = {
    currentTime: 0,
    sampleRate: 8000,
    state: "running",
    resumed: 0,
    closed: 0,
    close() {
      ctx.closed++;
      return Promise.resolve();
    },
    destination: node({}),
    oscillators: [],
    noiseSources: [],
    gains: [],
    filters: [],
    resume() {
      ctx.resumed++;
      return Promise.resolve();
    },
    createGain() {
      const g: FakeGain = node({ gain: param() });
      ctx.gains.push(g);
      return g;
    },
    createOscillator() {
      const o = source();
      ctx.oscillators.push(o);
      return o;
    },
    createBiquadFilter() {
      const f: FakeFilter = node({ type: "lowpass", frequency: param() });
      ctx.filters.push(f);
      return f;
    },
    createDynamicsCompressor() {
      return node({
        threshold: param(),
        knee: param(),
        ratio: param(),
        attack: param(),
        release: param(),
      });
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
