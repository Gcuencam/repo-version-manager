import type { Readable, Writable } from 'node:stream'
import { MultiSelectPrompt } from '@clack/core'
import pc from 'picocolors'

export interface ExploreOption {
  /** Relative path from the repo root, always '/'-joined (e.g. 'api' or 'api/core'). */
  value: string
  label: string
  hint?: string
  depth: 0 | 1
  /** Depth-1 only: the value of the first-level folder that contains this one. */
  parent?: string
  expandable: boolean
  expanded: boolean
}

/** Returns a new array with `children` spliced in right after `index`; marks the row expanded. */
export function expandAt(
  options: ExploreOption[],
  index: number,
  children: ExploreOption[]
): ExploreOption[] {
  const parent = options[index]
  if (!parent || parent.depth !== 0 || parent.expanded || children.length === 0) return options
  return [
    ...options.slice(0, index),
    { ...parent, expanded: true },
    ...children,
    ...options.slice(index + 1),
  ]
}

/** Removes the children of the row at `index`; returns their values so the caller can deselect them. */
export function collapseAt(
  options: ExploreOption[],
  index: number
): { options: ExploreOption[]; removedValues: string[] } {
  const parent = options[index]
  if (!parent || parent.depth !== 0 || !parent.expanded) return { options, removedValues: [] }
  const removedValues = options.filter((o) => o.parent === parent.value).map((o) => o.value)
  return {
    options: options
      .filter((o) => o.parent !== parent.value)
      .map((o) => (o.value === parent.value ? { ...o, expanded: false } : o)),
    removedValues,
  }
}

const unicode = process.platform !== 'win32'
const sym = (c: string, fallback: string) => (unicode ? c : fallback)
const S_BAR = sym('│', '|')
const S_BAR_END = sym('└', '—')
const S_STEP_ACTIVE = sym('◆', '*')
const S_STEP_CANCEL = sym('■', 'x')
const S_STEP_ERROR = sym('▲', 'x')
const S_STEP_SUBMIT = sym('◇', 'o')
const S_CHECKBOX_ACTIVE = sym('◻', '[•]')
const S_CHECKBOX_SELECTED = sym('◼', '[+]')
const S_CHECKBOX_INACTIVE = sym('◻', '[ ]')

const stateSymbol = (state: string): string => {
  switch (state) {
    case 'error':
      return pc.yellow(S_STEP_ERROR)
    case 'cancel':
      return pc.red(S_STEP_CANCEL)
    case 'submit':
      return pc.green(S_STEP_SUBMIT)
    default:
      return pc.cyan(S_STEP_ACTIVE)
  }
}

const styleOption = (option: ExploreOption, active: boolean, selected: boolean): string => {
  const label = (option.depth === 1 ? '  ' : '') + option.label
  const hints = [
    option.hint ? pc.dim(`(${option.hint})`) : '',
    option.expandable && active
      ? pc.dim(option.expanded ? '[e to collapse]' : '[e to explore]')
      : '',
  ]
    .filter(Boolean)
    .join(' ')
  if (selected && active) return `${pc.green(S_CHECKBOX_SELECTED)} ${label} ${hints}`.trimEnd()
  if (selected) {
    const hint = option.hint ? ` ${pc.dim(`(${option.hint})`)}` : ''
    return `${pc.green(S_CHECKBOX_SELECTED)} ${pc.dim(label)}${hint}`
  }
  if (active) return `${pc.cyan(S_CHECKBOX_ACTIVE)} ${label} ${hints}`.trimEnd()
  return `${pc.dim(S_CHECKBOX_INACTIVE)} ${pc.dim(label)}`
}

export interface ExploreMultiselectOptions {
  message: string
  /** First-level (depth-0) rows. */
  options: ExploreOption[]
  /** Lazily scans a first-level folder; called at most once per folder ("e" key). */
  loadChildren: (parentValue: string) => ExploreOption[]
  initialValues?: string[]
  required?: boolean
  input?: Readable
  output?: Writable
}

/**
 * Multiselect where first-level folders can be expanded in place with the "e" key
 * to reveal (and select) their second-level subfolders.
 */
export function exploreMultiselect(opts: ExploreMultiselectOptions): Promise<string[] | symbol> {
  const required = opts.required ?? true
  const childrenCache = new Map<string, ExploreOption[]>()

  const prompt = new MultiSelectPrompt<ExploreOption>({
    options: opts.options,
    initialValues: opts.initialValues,
    input: opts.input,
    output: opts.output,
    validate: (selected: string[]) => {
      if (required && selected.length === 0)
        return `Please select at least one option.\n${pc.reset(
          pc.dim(
            `Press ${pc.gray(pc.bgWhite(pc.inverse(' space ')))} to select, ${pc.gray(
              pc.bgWhite(pc.inverse(' enter '))
            )} to submit`
          )
        )}`
    },
    render() {
      const title = `${pc.gray(S_BAR)}\n${stateSymbol(this.state)}  ${opts.message}\n`
      const selectedValues = this.value as string[]
      const rows = this.options.map((o, i) =>
        styleOption(o, i === this.cursor, selectedValues.includes(o.value))
      )
      switch (this.state) {
        case 'submit': {
          const picked = this.options
            .filter((o) => selectedValues.includes(o.value))
            .map((o) => pc.dim(o.label))
            .join(pc.dim(', '))
          return `${title}${pc.gray(S_BAR)}  ${picked || pc.dim('none')}`
        }
        case 'cancel': {
          const picked = this.options
            .filter((o) => selectedValues.includes(o.value))
            .map((o) => pc.strikethrough(pc.dim(o.label)))
            .join(pc.dim(', '))
          return `${title}${pc.gray(S_BAR)}  ${picked}${picked ? `\n${pc.gray(S_BAR)}` : ''}`
        }
        case 'error': {
          const footer = this.error
            .split('\n')
            .map((line, i) => (i === 0 ? `${pc.yellow(S_BAR_END)}  ${pc.yellow(line)}` : `   ${line}`))
            .join('\n')
          return `${title}${pc.yellow(S_BAR)}  ${rows.join(`\n${pc.yellow(S_BAR)}  `)}\n${footer}\n`
        }
        default:
          return `${title}${pc.cyan(S_BAR)}  ${rows.join(`\n${pc.cyan(S_BAR)}  `)}\n${pc.cyan(S_BAR_END)}\n`
      }
    },
  })

  prompt.on('key', (key) => {
    if (key !== 'e') return
    const current = prompt.options[prompt.cursor]
    if (!current || current.depth !== 0 || !current.expandable) return
    if (current.expanded) {
      const { options, removedValues } = collapseAt(prompt.options, prompt.cursor)
      prompt.options = options
      prompt.value = (prompt.value as string[]).filter((v) => !removedValues.includes(v))
      prompt.cursor = Math.min(prompt.cursor, prompt.options.length - 1)
    } else {
      let children = childrenCache.get(current.value)
      if (!children) {
        children = opts.loadChildren(current.value)
        childrenCache.set(current.value, children)
      }
      prompt.options = expandAt(prompt.options, prompt.cursor, children)
    }
  })

  return prompt.prompt() as Promise<string[] | symbol>
}
