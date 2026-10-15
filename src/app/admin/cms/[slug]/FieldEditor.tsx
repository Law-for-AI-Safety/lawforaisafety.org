"use client";

import { useId } from "react";
import { newItem, type FieldSpec } from "@/cms/fields";
import { IMAGE_PATH } from "@/cms/schema";
import RichTextField from "./RichTextField";

export type Path = (string | number)[];

/** What every field editor needs: where it is, the problems by path key, and how to change it. */
export type FieldContext = {
  problems: Map<string, string[]>;
  images: string[];
  set: (path: Path, value: unknown) => void;
};

const key = (path: Path) => path.join(".");

function Problems({ messages }: { messages: string[] | undefined }) {
  if (!messages?.length) return null;
  return (
    <ul className="text-sm text-brand-red">
      {messages.map((m, i) => (
        <li key={i}>{m}</li>
      ))}
    </ul>
  );
}

const INPUT = "rounded-sm border bg-brand-white px-2 py-1";

function PlainField({ spec, value, path, ctx }: { spec: Extract<FieldSpec, { kind: "plain" }>; value: unknown; path: Path; ctx: FieldContext }) {
  const id = useId();
  const messages = ctx.problems.get(key(path));
  const props = {
    id,
    value: typeof value === "string" ? value : "",
    "aria-invalid": messages ? true : undefined,
    "aria-describedby": spec.hint ? `${id}-hint` : undefined,
    className: `${INPUT} ${messages ? "border-brand-red" : "border-brand-black/30"}`,
    onChange: (e: { target: { value: string } }) =>
      // An optional field left empty is left out of the page.
      ctx.set(path, spec.optional && e.target.value === "" ? undefined : e.target.value),
  };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-brand-black/80">
        {spec.label}
      </label>
      {spec.long ? <textarea rows={3} {...props} /> : <input {...props} />}
      {spec.hint && (
        <span id={`${id}-hint`} className="text-xs text-brand-black/60">
          {spec.hint}
        </span>
      )}
      <Problems messages={messages} />
    </div>
  );
}

function ImageField({ spec, value, path, ctx }: { spec: Extract<FieldSpec, { kind: "image" }>; value: unknown; path: Path; ctx: FieldContext }) {
  const id = useId();
  const current = typeof value === "string" ? value : "";
  const options = current && !ctx.images.includes(current) ? [current, ...ctx.images] : ctx.images;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-brand-black/80">
        {spec.label}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <select
          id={id}
          value={current}
          onChange={(e) => ctx.set(path, e.target.value === "" ? undefined : e.target.value)}
          className={`${INPUT} border-brand-black/30`}
        >
          <option value="">No image</option>
          {options.map((image) => (
            <option key={image} value={image}>
              {image.replace(/^\/images\//, "")}
            </option>
          ))}
        </select>
        {/* Only a value of the image-field form (a file under /images/) is shown; a draft may hold
            any string, and that is never used as an image source. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {IMAGE_PATH.test(current) && <img src={current} alt="" className="h-16 w-16 rounded-sm object-cover" />}
      </div>
      <Problems messages={ctx.problems.get(key(path))} />
    </div>
  );
}

function ListField({ spec, value, path, ctx }: { spec: Extract<FieldSpec, { kind: "list" }>; value: unknown; path: Path; ctx: FieldContext }) {
  const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  const move = (from: number, to: number) => {
    const next = [...items];
    [next[from], next[to]] = [next[to], next[from]];
    ctx.set(path, next);
  };
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm text-brand-black/80">{spec.label}</legend>
      <Problems messages={ctx.problems.get(key(path))} />
      {items.map((item, i) => (
        <div key={i} className="flex flex-col gap-3 border-l-2 border-brand-black/15 pl-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-brand-black">
              {spec.itemLabel} {i + 1}
            </span>
            <button type="button" aria-label={`Move ${spec.itemLabel.toLowerCase()} ${i + 1} up`} disabled={i === 0} onClick={() => move(i, i - 1)} className="text-sm underline disabled:no-underline disabled:opacity-40">
              Move up
            </button>
            <button type="button" aria-label={`Move ${spec.itemLabel.toLowerCase()} ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)} className="text-sm underline disabled:no-underline disabled:opacity-40">
              Move down
            </button>
            <button
              type="button"
              onClick={() => ctx.set(path, items.filter((_, j) => j !== i))}
              className="text-sm text-brand-red underline"
            >
              Remove {spec.itemLabel.toLowerCase()} {i + 1}
            </button>
          </div>
          <Fields fields={spec.fields} value={item} path={[...path, i]} ctx={ctx} />
        </div>
      ))}
      {items.length < spec.max && (
        <button type="button" onClick={() => ctx.set(path, [...items, newItem(spec.fields)])} className="self-start text-sm underline">
          Add {spec.itemLabel.toLowerCase()}
        </button>
      )}
    </fieldset>
  );
}

/** The editors for a set of fields of `value`, which sits at `path` in the page. */
export function Fields({ fields, value, path, ctx }: { fields: FieldSpec[]; value: Record<string, unknown>; path: Path; ctx: FieldContext }) {
  return (
    <>
      {fields.map((spec) => {
        const at = [...path, spec.key];
        const v = value[spec.key];
        switch (spec.kind) {
          case "plain":
            return <PlainField key={spec.key} spec={spec} value={v} path={at} ctx={ctx} />;
          case "rich":
            return (
              <div key={spec.key} className="flex flex-col gap-1">
                <RichTextField
                  label={spec.label}
                  kind={spec.rich}
                  value={typeof v === "string" ? v : ""}
                  invalid={ctx.problems.has(key(at))}
                  onChange={(next) => ctx.set(at, spec.optional && next === "" ? undefined : next)}
                />
                <Problems messages={ctx.problems.get(key(at))} />
              </div>
            );
          case "image":
            return <ImageField key={spec.key} spec={spec} value={v} path={at} ctx={ctx} />;
          case "boolean":
            return (
              <label key={spec.key} className="flex items-start gap-2 text-sm text-brand-black/80">
                <input type="checkbox" checked={v === true} onChange={(e) => ctx.set(at, e.target.checked)} className="mt-1" />
                <span>
                  {spec.label}
                  {spec.hint && <span className="block text-xs text-brand-black/60">{spec.hint}</span>}
                </span>
              </label>
            );
          case "list":
            return <ListField key={spec.key} spec={spec} value={v} path={at} ctx={ctx} />;
        }
      })}
    </>
  );
}
