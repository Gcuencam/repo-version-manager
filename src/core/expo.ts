import fs from 'node:fs'
import path from 'node:path'
import type { RvmConfig } from './config.js'

/** Key used in the `expo` config block for the repository root (single-repo Expo apps). */
export const ROOT_SERVICE = '.'

/** Native version targets managed for an Expo/React Native service. */
export interface ExpoTargets {
  ios: boolean
  android: boolean
  syncAppJson: boolean
}

/** `.rpvmrc.json` with the optional `expo` block (keyed by service name, ROOT_SERVICE for the root). */
export type ExpoRvmConfig = RvmConfig & { expo?: Record<string, ExpoTargets> }

/** Expo targets stored in the config; readConfig preserves the extra `expo` field of the JSON. */
export function expoTargetsFromConfig(config: RvmConfig): Record<string, ExpoTargets> {
  return (config as ExpoRvmConfig).expo ?? {}
}

export interface ExpoProject {
  hasIos: boolean
  hasAndroid: boolean
  /** ios/<App>/Info.plist */
  infoPlistPath: string | null
  /** ios/<App>.xcodeproj/project.pbxproj */
  pbxprojPath: string | null
  /** android/app/build.gradle */
  buildGradlePath: string | null
  appJsonPath: string | null
  /** app.config.js/ts: code, cannot be edited safely */
  appConfigCodePath: string | null
}

export interface NativeState {
  /** Effective iOS marketing version (literal Info.plist value wins over pbxproj). */
  iosVersion: string | null
  iosBuildNumber: number | null
  androidVersionName: string | null
  androidVersionCode: number | null
  appJsonVersion: string | null
}

export interface NativeUpdateResult {
  /** Paths relative to the repo root, ready for `git add`. */
  changed: string[]
  warnings: string[]
}

const IGNORED_IOS_DIRS = new Set(['Pods', 'build'])

function readIfExists(file: string | null): string | null {
  if (!file || !fs.existsSync(file)) return null
  return fs.readFileSync(file, 'utf8')
}

/** True when the directory looks like an Expo app (app.json with "expo" or expo dependency). */
export function isExpoApp(dir: string): boolean {
  try {
    const appJson = path.join(dir, 'app.json')
    if (fs.existsSync(appJson)) {
      const parsed = JSON.parse(fs.readFileSync(appJson, 'utf8')) as Record<string, unknown>
      if (parsed.expo && typeof parsed.expo === 'object') return true
    }
    const pkgFile = path.join(dir, 'package.json')
    if (fs.existsSync(pkgFile)) {
      const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as {
        dependencies?: Record<string, string>
      }
      if (pkg.dependencies?.expo) return true
    }
  } catch {
    return false
  }
  return false
}

/** Locates the native version files of an ejected Expo/React Native project. */
export function detectExpoProject(dir: string): ExpoProject {
  const iosDir = path.join(dir, 'ios')
  const androidGradle = path.join(dir, 'android', 'app', 'build.gradle')

  let infoPlistPath: string | null = null
  let pbxprojPath: string | null = null
  if (fs.existsSync(iosDir) && fs.statSync(iosDir).isDirectory()) {
    for (const entry of fs.readdirSync(iosDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || IGNORED_IOS_DIRS.has(entry.name)) continue
      if (entry.name.endsWith('.xcodeproj')) {
        const candidate = path.join(iosDir, entry.name, 'project.pbxproj')
        if (fs.existsSync(candidate)) pbxprojPath ??= candidate
      } else {
        const candidate = path.join(iosDir, entry.name, 'Info.plist')
        if (fs.existsSync(candidate)) infoPlistPath ??= candidate
      }
    }
  }

  const appJsonPath = fs.existsSync(path.join(dir, 'app.json')) ? path.join(dir, 'app.json') : null
  const appConfigCodePath =
    ['app.config.ts', 'app.config.js'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f)) ??
    null

  return {
    hasIos: pbxprojPath !== null || infoPlistPath !== null,
    hasAndroid: fs.existsSync(androidGradle),
    infoPlistPath,
    pbxprojPath,
    buildGradlePath: fs.existsSync(androidGradle) ? androidGradle : null,
    appJsonPath,
    appConfigCodePath,
  }
}

function plistValue(plist: string, key: string): string | null {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`))
  return match ? match[1]! : null
}

const isPlistVariable = (value: string | null): boolean => value?.startsWith('$(') ?? false

/** Reads the current native versions; literal Info.plist values win over pbxproj settings. */
export function readNativeState(project: ExpoProject): NativeState {
  const plist = readIfExists(project.infoPlistPath)
  const pbxproj = readIfExists(project.pbxprojPath)
  const gradle = readIfExists(project.buildGradlePath)
  const appJson = readIfExists(project.appJsonPath)

  let iosVersion: string | null = null
  let iosBuildNumber: number | null = null
  if (plist) {
    const shortVersion = plistValue(plist, 'CFBundleShortVersionString')
    const bundleVersion = plistValue(plist, 'CFBundleVersion')
    if (shortVersion && !isPlistVariable(shortVersion)) iosVersion = shortVersion
    if (bundleVersion && !isPlistVariable(bundleVersion) && /^\d+$/.test(bundleVersion)) {
      iosBuildNumber = Number(bundleVersion)
    }
  }
  if (pbxproj) {
    iosVersion ??= pbxproj.match(/MARKETING_VERSION = ([^;]+);/)?.[1]?.trim() ?? null
    if (iosBuildNumber === null) {
      const value = pbxproj.match(/CURRENT_PROJECT_VERSION = (\d+);/)?.[1]
      if (value) iosBuildNumber = Number(value)
    }
  }

  let androidVersionName: string | null = null
  let androidVersionCode: number | null = null
  if (gradle) {
    androidVersionName = gradle.match(/versionName\s+["']([^"']+)["']/)?.[1] ?? null
    const code = gradle.match(/versionCode\s+(\d+)/)?.[1]
    if (code) androidVersionCode = Number(code)
  }

  let appJsonVersion: string | null = null
  if (appJson) {
    try {
      const parsed = JSON.parse(appJson) as { expo?: { version?: string } }
      appJsonVersion = parsed.expo?.version ?? null
    } catch {
      appJsonVersion = null
    }
  }

  return { iosVersion, iosBuildNumber, androidVersionName, androidVersionCode, appJsonVersion }
}

/** Next shared build number: one past the highest build number/versionCode found anywhere. */
export function nextBuildNumber(state: NativeState): number {
  return Math.max(0, state.iosBuildNumber ?? 0, state.androidVersionCode ?? 0) + 1
}

function updateGradle(gradlePath: string, version: string, buildNumber: number, result: NativeUpdateResult, root: string): void {
  const raw = readIfExists(gradlePath)
  if (raw === null) return
  let updated = raw
  let touched = false

  if (/versionName\s+["'][^"']*["']/.test(updated)) {
    updated = updated.replace(/(versionName\s+)(["'])[^"']*\2/, `$1$2${version}$2`)
    touched = true
  } else {
    result.warnings.push(
      `android/app/build.gradle: no literal versionName found (is it set from a variable?); update it manually.`
    )
  }
  if (/versionCode\s+\d+/.test(updated)) {
    updated = updated.replace(/(versionCode\s+)\d+/, `$1${buildNumber}`)
    touched = true
  } else {
    result.warnings.push(
      `android/app/build.gradle: no literal versionCode found (is it set from a variable?); update it manually.`
    )
  }

  if (touched && updated !== raw) {
    fs.writeFileSync(gradlePath, updated)
    result.changed.push(path.relative(root, gradlePath))
  }
}

function updatePbxproj(pbxprojPath: string, version: string, buildNumber: number, result: NativeUpdateResult, root: string): void {
  const raw = readIfExists(pbxprojPath)
  if (raw === null) return
  const updated = raw
    .replace(/(MARKETING_VERSION = )[^;]+;/g, `$1${version};`)
    .replace(/(CURRENT_PROJECT_VERSION = )[^;]+;/g, `$1${buildNumber};`)
  if (updated !== raw) {
    fs.writeFileSync(pbxprojPath, updated)
    result.changed.push(path.relative(root, pbxprojPath))
  }
}

function updatePlist(plistPath: string, version: string, buildNumber: number, result: NativeUpdateResult, root: string): void {
  const raw = readIfExists(plistPath)
  if (raw === null) return
  let updated = raw
  for (const [key, value] of [
    ['CFBundleShortVersionString', version],
    ['CFBundleVersion', String(buildNumber)],
  ] as const) {
    const current = plistValue(updated, key)
    if (current === null || isPlistVariable(current)) continue
    updated = updated.replace(
      new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`),
      `$1${value}$2`
    )
  }
  if (updated !== raw) {
    fs.writeFileSync(plistPath, updated)
    result.changed.push(path.relative(root, plistPath))
  }
}

function updateAppJson(appJsonPath: string, version: string, buildNumber: number, result: NativeUpdateResult, root: string): void {
  const raw = readIfExists(appJsonPath)
  if (raw === null) return
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    result.warnings.push(`app.json: invalid JSON; update expo.version manually.`)
    return
  }
  const expo = parsed.expo as
    | { version?: string; ios?: { buildNumber?: string }; android?: { versionCode?: number } }
    | undefined
  if (!expo) return

  expo.version = version
  // Only sync build fields that the project already declares.
  if (expo.ios && 'buildNumber' in expo.ios) expo.ios.buildNumber = String(buildNumber)
  if (expo.android && 'versionCode' in expo.android) expo.android.versionCode = buildNumber

  const indentMatch = raw.match(/^([ \t]+)"/m)
  const indent = indentMatch ? indentMatch[1]! : 2
  const trailingNewline = raw.endsWith('\n') ? '\n' : ''
  const updated = JSON.stringify(parsed, null, indent) + trailingNewline
  if (updated !== raw) {
    fs.writeFileSync(appJsonPath, updated)
    result.changed.push(path.relative(root, appJsonPath))
  }
}

/**
 * Writes `version`/`buildNumber` to every managed native file of the service.
 * Returns the changed files (relative to `root`) and any manual-action warnings.
 */
export function updateNativeVersions(
  root: string,
  project: ExpoProject,
  targets: ExpoTargets,
  version: string,
  buildNumber: number
): NativeUpdateResult {
  const result: NativeUpdateResult = { changed: [], warnings: [] }

  if (targets.android) {
    if (project.buildGradlePath) {
      updateGradle(project.buildGradlePath, version, buildNumber, result, root)
    } else {
      result.warnings.push('android/app/build.gradle not found; skipping Android version bump.')
    }
  }

  if (targets.ios) {
    if (project.pbxprojPath) updatePbxproj(project.pbxprojPath, version, buildNumber, result, root)
    if (project.infoPlistPath) updatePlist(project.infoPlistPath, version, buildNumber, result, root)
    if (!project.pbxprojPath && !project.infoPlistPath) {
      result.warnings.push('No ios/*.xcodeproj or ios/*/Info.plist found; skipping iOS version bump.')
    }
  }

  if (targets.syncAppJson) {
    if (project.appJsonPath) {
      updateAppJson(project.appJsonPath, version, buildNumber, result, root)
    } else if (project.appConfigCodePath) {
      result.warnings.push(
        `${path.basename(project.appConfigCodePath)} is code and cannot be edited; update its version manually.`
      )
    }
  }

  return result
}
