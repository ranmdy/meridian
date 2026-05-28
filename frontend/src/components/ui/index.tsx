'use client';

import React from 'react';
import { KIND_COLOR, STEP_GLYPH, ASSETS } from '@/src/lib/mockData';

/* PANEL ---------------------------------------------------------------- */
interface PanelProps {
  title?: React.ReactNode;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPad?: boolean;
  flush?: boolean;
}
export function Panel({ title, sub, right, children, className = '', noPad = false, flush = false }: PanelProps) {
  return (
    <section className={(flush ? 'panel-flush' : 'panel') + (className ? ' ' + className : '')}>
      {(title || right) && (
        <div className="section-head">
          <div className="col gap-1">
            {title && <div className="title">{title}</div>}
            {sub && <div className="caption">{sub}</div>}
          </div>
          {right}
        </div>
      )}
      <div className={noPad ? '' : 'p-5'}>
        {children}
      </div>
    </section>
  );
}

/* TAG ------------------------------------------------------------------ */
interface TagProps {
  tone?: 'ok' | 'warn' | 'bad' | 'info' | 'signal' | 'neutral';
  solid?: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export function Tag({ tone = 'neutral', solid, children, className = '', style }: TagProps) {
  const map: Record<string, string> = {
    ok: 'tag-ok', warn: 'tag-warn', bad: 'tag-bad',
    info: 'tag-info', signal: 'tag-signal', neutral: '',
  };
  return (
    <span
      className={`tag ${map[tone] || ''} ${solid ? 'tag-solid' : ''} ${className}`.trim()}
      style={style}
    >
      {children}
    </span>
  );
}

/* RISK TAG ------------------------------------------------------------- */
export function RiskTag({ score }: { score: number }) {
  const tone = score < 30 ? 'ok' : score < 60 ? 'warn' : 'bad';
  const label = score < 30 ? 'Low' : score < 60 ? 'Moderate' : 'High';
  return <span className={'tag tag-' + tone}>{label} · {score}</span>;
}

/* KIND BADGE ----------------------------------------------------------- */
export function KindBadge({ kind }: { kind: string }) {
  const color = KIND_COLOR[kind] || 'var(--ink)';
  return (
    <span className="mono" style={{ color, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 500 }}>
      <span className="dot-sq" style={{ marginRight: 6, color }} /> {kind}
    </span>
  );
}

/* ASSET DOT ------------------------------------------------------------ */
export function AssetDot({ sym, size = 8 }: { sym: string; size?: number }) {
  const a = ASSETS[sym];
  const color = a ? a.color : 'var(--c-slate)';
  return <span style={{ display: 'inline-block', width: size, height: size, background: color, borderRadius: 999 }} />;
}

/* BAR ------------------------------------------------------------------ */
interface BarProps {
  value: number;
  max?: number;
  color?: string;
}
export function Bar({ value, max = 100, color = 'var(--ink)' }: BarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="bar">
      <div
        className="bar-fill"
        style={{ background: color, width: pct + '%', transform: 'none', position: 'absolute', height: '100%', left: 0, top: 0 }}
      />
    </div>
  );
}

/* RISK BAR ------------------------------------------------------------- */
export function RiskBar({ score }: { score: number }) {
  return (
    <div style={{ display: 'flex', gap: 2, height: 6, width: '100%' }}>
      {[0, 1, 2, 3, 4].map(i => {
        const threshold = (i + 1) * 20;
        const active = score >= threshold - 10;
        const color = threshold <= 30 ? 'var(--ok)' : threshold <= 60 ? 'var(--warn)' : 'var(--bad)';
        return (
          <div
            key={i}
            style={{ flex: 1, background: active ? color : 'color-mix(in oklch, var(--ink) 8%, transparent)' }}
          />
        );
      })}
    </div>
  );
}

/* STEP CHAIN ----------------------------------------------------------- */
interface StepChainStep {
  kind: string;
  label: string;
  from?: string;
  to?: string;
  token?: string;
}
export function StepChain({ steps }: { steps: StepChainStep[] }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-2)' }}>
            <span style={{ color: 'var(--ink-3)', marginRight: 6 }}>{STEP_GLYPH[s.kind] || '·'}</span>
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="mono c-ink-3" style={{ fontSize: 11 }}>—</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

/* FIELD ---------------------------------------------------------------- */
interface FieldProps {
  label: string;
  sub?: string;
  children: React.ReactNode;
}
export function Field({ label, sub, children }: FieldProps) {
  return (
    <div className="field-row">
      <div className="between">
        <span className="label">{label}</span>
        {sub && <span className="caption mono">{sub}</span>}
      </div>
      {children}
    </div>
  );
}

/* SEGMENTED ------------------------------------------------------------ */
interface SegmentedOption {
  label: string;
  value: string;
}
interface SegmentedProps {
  options: (string | SegmentedOption)[];
  value: string;
  onChange: (val: string) => void;
  tone?: string;
}
export function Segmented({ options, value, onChange }: SegmentedProps) {
  return (
    <div
      className="flex"
      style={{
        border: '1px solid color-mix(in oklch, var(--ink) 22%, transparent)',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      {options.map((o, i) => {
        const val = typeof o === 'object' ? o.value : o;
        const label = typeof o === 'object' ? o.label : o;
        const active = val === value;
        return (
          <button
            key={val}
            onClick={() => onChange(val)}
            style={{
              flex: 1,
              padding: '8px 10px',
              fontSize: 12,
              fontFamily: 'var(--sans)',
              fontWeight: 500,
              background: active ? 'var(--ink)' : 'transparent',
              color: active ? 'var(--paper)' : 'var(--ink-2)',
              borderLeft: i === 0 ? 'none' : '1px solid color-mix(in oklch, var(--ink) 18%, transparent)',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* RISK LEVELS ---------------------------------------------------------- */
interface RiskLevelsProps {
  value: number;
  onChange: (val: number) => void;
}
export function RiskLevels({ value, onChange }: RiskLevelsProps) {
  const labels = ['Conservative', 'Low', 'Moderate', 'High', 'Aggressive'];
  const colors = ['var(--ok)', 'var(--ok)', 'var(--warn)', 'var(--c-clay)', 'var(--bad)'];
  return (
    <div className="col gap-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(n => {
          const active = n === value;
          return (
            <button
              key={n}
              onClick={() => onChange(n)}
              style={{
                flex: 1,
                padding: '10px 0',
                fontFamily: 'var(--mono)',
                fontSize: 12,
                fontWeight: 500,
                background: active ? colors[n - 1] : 'transparent',
                color: active ? 'var(--paper)' : colors[n - 1],
                border: '1px solid ' + (active ? colors[n - 1] : 'color-mix(in oklch, var(--ink) 18%, transparent)'),
                borderRadius: 0,
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="between">
        <span className="caption mono">{labels[value - 1]}</span>
        <span className="caption mono c-ink-3">Risk level</span>
      </div>
    </div>
  );
}

/* SPINNER -------------------------------------------------------------- */
export function Spinner({ size = 14 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} />;
}

/* MODAL ---------------------------------------------------------------- */
interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}
export function Modal({ open, onClose, children }: ModalProps) {
  if (!open) return null;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* STAT BOX ------------------------------------------------------------- */
interface StatBoxProps {
  label: string;
  value: React.ReactNode;
  sub?: string;
  color?: string;
  mono?: boolean;
  large?: boolean;
}
export function StatBox({ label, value, sub, color = 'var(--ink)', mono = true, large = false }: StatBoxProps) {
  return (
    <div className="card p-5">
      <div className="label mb-2">{label}</div>
      <div className={mono ? (large ? 'num-xl' : 'num-lg') : 'h2'} style={{ color }}>{value}</div>
      {sub && <div className="caption mt-2">{sub}</div>}
    </div>
  );
}

/* PAGE HEAD ------------------------------------------------------------ */
interface PageHeadProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  desc?: string;
  right?: React.ReactNode;
}
export function PageHead({ eyebrow, title, desc, right }: PageHeadProps) {
  return (
    <div className="page-head">
      <div className="col gap-3">
        {eyebrow && <div className="meta">{eyebrow}</div>}
        <h1 className="title">{title}</h1>
        {desc && <p className="desc">{desc}</p>}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

/* EMPTY STATE ---------------------------------------------------------- */
interface EmptyProps {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}
export function Empty({ title, hint, action }: EmptyProps) {
  return (
    <div className="p-8 text-center col gap-2" style={{ alignItems: 'center' }}>
      <div className="serif-it" style={{ fontSize: 28, color: 'var(--ink-2)' }}>{title}</div>
      {hint && <div className="caption muted">{hint}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
