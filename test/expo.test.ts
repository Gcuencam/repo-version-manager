import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  type ExpoTargets,
  detectExpoProject,
  isExpoApp,
  nextBuildNumber,
  readNativeState,
  updateNativeVersions,
} from '../src/core/expo.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpvm-expo-test-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const ALL_TARGETS: ExpoTargets = { ios: true, android: true, syncAppJson: true }

const GRADLE = `android {
    namespace 'com.anonymous.odo'
    defaultConfig {
        applicationId 'com.anonymous.odo'
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 7
        versionName "1.2.3"

        buildConfigField "String", "REACT_NATIVE_RELEASE_LEVEL", "\\"stable\\""
    }
}
`

const PBXPROJ = `		13B07F941A680F5B00A75B9A /* Debug */ = {
			buildSettings = {
				CURRENT_PROJECT_VERSION = 7;
				INFOPLIST_FILE = odo/Info.plist;
				MARKETING_VERSION = 1.0;
			};
		};
		13B07F951A680F5B00A75B9A /* Release */ = {
			buildSettings = {
				CURRENT_PROJECT_VERSION = 6;
				MARKETING_VERSION = 1.0;
			};
		};
`

const PLIST_LITERAL = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>CFBundleShortVersionString</key>
	<string>1.2.3</string>
	<key>CFBundleSignature</key>
	<string>????</string>
	<key>CFBundleVersion</key>
	<string>7</string>
</dict>
</plist>
`

const PLIST_VARIABLES = PLIST_LITERAL.replace('<string>1.2.3</string>', '<string>$(MARKETING_VERSION)</string>').replace(
  '<string>7</string>',
  '<string>$(CURRENT_PROJECT_VERSION)</string>'
)

const APP_JSON = `{
  "expo": {
    "name": "odo",
    "version": "1.2.3",
    "ios": {
      "buildNumber": "7"
    },
    "android": {
      "versionCode": 7
    }
  }
}
`

function writeFixture(options: { plist?: string; gradle?: boolean; appJson?: string } = {}): void {
  fs.mkdirSync(path.join(dir, 'ios', 'odo'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'ios', 'odo.xcodeproj'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'ios', 'Pods'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'ios', 'odo', 'Info.plist'), options.plist ?? PLIST_LITERAL)
  fs.writeFileSync(path.join(dir, 'ios', 'odo.xcodeproj', 'project.pbxproj'), PBXPROJ)
  if (options.gradle !== false) {
    fs.mkdirSync(path.join(dir, 'android', 'app'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'android', 'app', 'build.gradle'), GRADLE)
  }
  fs.writeFileSync(path.join(dir, 'app.json'), options.appJson ?? APP_JSON)
}

describe('isExpoApp', () => {
  it('detects an app.json with an expo key', () => {
    fs.writeFileSync(path.join(dir, 'app.json'), APP_JSON)
    expect(isExpoApp(dir)).toBe(true)
  })

  it('detects an expo dependency in package.json', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { expo: '~52.0.0' } }))
    expect(isExpoApp(dir)).toBe(true)
  })

  it('returns false for a plain node project', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'api' }))
    expect(isExpoApp(dir)).toBe(false)
  })
})

describe('detectExpoProject', () => {
  it('finds the native files and ignores Pods', () => {
    writeFixture()
    const project = detectExpoProject(dir)
    expect(project.hasIos).toBe(true)
    expect(project.hasAndroid).toBe(true)
    expect(project.infoPlistPath).toBe(path.join(dir, 'ios', 'odo', 'Info.plist'))
    expect(project.pbxprojPath).toBe(path.join(dir, 'ios', 'odo.xcodeproj', 'project.pbxproj'))
    expect(project.buildGradlePath).toBe(path.join(dir, 'android', 'app', 'build.gradle'))
    expect(project.appJsonPath).toBe(path.join(dir, 'app.json'))
  })

  it('handles android-only projects', () => {
    fs.mkdirSync(path.join(dir, 'android', 'app'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'android', 'app', 'build.gradle'), GRADLE)
    const project = detectExpoProject(dir)
    expect(project.hasIos).toBe(false)
    expect(project.hasAndroid).toBe(true)
  })

  it('detects app.config.ts as non-editable config', () => {
    fs.writeFileSync(path.join(dir, 'app.config.ts'), 'export default {}')
    expect(detectExpoProject(dir).appConfigCodePath).toBe(path.join(dir, 'app.config.ts'))
  })
})

describe('readNativeState', () => {
  it('reads literal plist values, gradle and app.json', () => {
    writeFixture()
    const state = readNativeState(detectExpoProject(dir))
    expect(state).toEqual({
      iosVersion: '1.2.3',
      iosBuildNumber: 7,
      androidVersionName: '1.2.3',
      androidVersionCode: 7,
      appJsonVersion: '1.2.3',
    })
  })

  it('falls back to pbxproj when the plist uses variables', () => {
    writeFixture({ plist: PLIST_VARIABLES })
    const state = readNativeState(detectExpoProject(dir))
    expect(state.iosVersion).toBe('1.0')
    expect(state.iosBuildNumber).toBe(7)
  })
})

describe('nextBuildNumber', () => {
  it('is one past the highest build number across platforms', () => {
    writeFixture()
    expect(nextBuildNumber(readNativeState(detectExpoProject(dir)))).toBe(8)
  })

  it('starts at 1 when nothing is found', () => {
    expect(
      nextBuildNumber({
        iosVersion: null,
        iosBuildNumber: null,
        androidVersionName: null,
        androidVersionCode: null,
        appJsonVersion: null,
      })
    ).toBe(1)
  })
})

describe('updateNativeVersions', () => {
  it('updates gradle, pbxproj, literal plist and app.json, reporting relative paths', () => {
    writeFixture()
    const result = updateNativeVersions(dir, detectExpoProject(dir), ALL_TARGETS, '1.3.0', 8)
    expect(result.warnings).toEqual([])
    expect(result.changed.sort()).toEqual([
      'android/app/build.gradle',
      'app.json',
      'ios/odo.xcodeproj/project.pbxproj',
      'ios/odo/Info.plist',
    ])

    const gradle = fs.readFileSync(path.join(dir, 'android', 'app', 'build.gradle'), 'utf8')
    expect(gradle).toContain('versionCode 8')
    expect(gradle).toContain('versionName "1.3.0"')
    expect(gradle).toContain('buildConfigField')

    const pbxproj = fs.readFileSync(path.join(dir, 'ios', 'odo.xcodeproj', 'project.pbxproj'), 'utf8')
    expect(pbxproj.match(/MARKETING_VERSION = 1\.3\.0;/g)).toHaveLength(2)
    expect(pbxproj.match(/CURRENT_PROJECT_VERSION = 8;/g)).toHaveLength(2)

    const plist = fs.readFileSync(path.join(dir, 'ios', 'odo', 'Info.plist'), 'utf8')
    expect(plist).toContain('<string>1.3.0</string>')
    expect(plist).toContain('<string>8</string>')
    expect(plist).toContain('<string>????</string>')

    const appJson = JSON.parse(fs.readFileSync(path.join(dir, 'app.json'), 'utf8'))
    expect(appJson.expo.version).toBe('1.3.0')
    expect(appJson.expo.ios.buildNumber).toBe('8')
    expect(appJson.expo.android.versionCode).toBe(8)
  })

  it('leaves plist variables untouched and still updates the pbxproj', () => {
    writeFixture({ plist: PLIST_VARIABLES })
    const result = updateNativeVersions(dir, detectExpoProject(dir), ALL_TARGETS, '1.3.0', 8)
    const plist = fs.readFileSync(path.join(dir, 'ios', 'odo', 'Info.plist'), 'utf8')
    expect(plist).toContain('$(MARKETING_VERSION)')
    expect(plist).toContain('$(CURRENT_PROJECT_VERSION)')
    expect(result.changed).not.toContain('ios/odo/Info.plist')
    expect(result.changed).toContain('ios/odo.xcodeproj/project.pbxproj')
  })

  it('does not add build fields that app.json does not declare', () => {
    writeFixture({ appJson: '{\n  "expo": {\n    "name": "odo",\n    "version": "1.2.3"\n  }\n}\n' })
    updateNativeVersions(dir, detectExpoProject(dir), ALL_TARGETS, '1.3.0', 8)
    const appJson = JSON.parse(fs.readFileSync(path.join(dir, 'app.json'), 'utf8'))
    expect(appJson.expo.version).toBe('1.3.0')
    expect(appJson.expo.ios).toBeUndefined()
    expect(appJson.expo.android).toBeUndefined()
  })

  it('preserves app.json indentation and trailing newline', () => {
    const raw = '{\n    "expo": {\n        "version": "1.2.3"\n    }\n}\n'
    writeFixture({ appJson: raw })
    updateNativeVersions(dir, detectExpoProject(dir), ALL_TARGETS, '1.3.0', 8)
    expect(fs.readFileSync(path.join(dir, 'app.json'), 'utf8')).toBe(
      '{\n    "expo": {\n        "version": "1.3.0"\n    }\n}\n'
    )
  })

  it('warns when versionCode comes from a gradle variable', () => {
    writeFixture()
    fs.writeFileSync(
      path.join(dir, 'android', 'app', 'build.gradle'),
      GRADLE.replace('versionCode 7', 'versionCode project.ext.versionCode')
    )
    const result = updateNativeVersions(dir, detectExpoProject(dir), ALL_TARGETS, '1.3.0', 8)
    expect(result.warnings.some((w) => w.includes('versionCode'))).toBe(true)
    const gradle = fs.readFileSync(path.join(dir, 'android', 'app', 'build.gradle'), 'utf8')
    expect(gradle).toContain('versionCode project.ext.versionCode')
    expect(gradle).toContain('versionName "1.3.0"')
  })

  it('only touches the platforms enabled in the targets', () => {
    writeFixture()
    const result = updateNativeVersions(
      dir,
      detectExpoProject(dir),
      { ios: false, android: true, syncAppJson: false },
      '1.3.0',
      8
    )
    expect(result.changed).toEqual(['android/app/build.gradle'])
    const plist = fs.readFileSync(path.join(dir, 'ios', 'odo', 'Info.plist'), 'utf8')
    expect(plist).toContain('<string>1.2.3</string>')
  })

  it('warns instead of editing app.config.ts', () => {
    fs.mkdirSync(path.join(dir, 'android', 'app'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'android', 'app', 'build.gradle'), GRADLE)
    fs.writeFileSync(path.join(dir, 'app.config.ts'), 'export default { expo: { version: "1.2.3" } }')
    const result = updateNativeVersions(dir, detectExpoProject(dir), ALL_TARGETS, '1.3.0', 8)
    expect(result.warnings.some((w) => w.includes('app.config.ts'))).toBe(true)
    expect(fs.readFileSync(path.join(dir, 'app.config.ts'), 'utf8')).toContain('1.2.3')
  })
})
