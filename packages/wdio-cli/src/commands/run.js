import fs from 'fs-extra'
import path from 'path'

import Launcher from './../launcher'
import Watcher from './../watcher'
import { missingConfigurationPrompt } from '../utils'
import { CLI_EPILOGUE } from '../constants'

export const command = 'run <configPath>'

export const desc = 'Run your WDIO configuration file to initialize your tests. (default)'

export const cmdArgs = {
    watch: {
        desc: 'Run WebdriverIO in watch mode',
        type: 'boolean',
    },
    hostname: {
        alias: 'h',
        desc: 'automation driver host address',
        type: 'string'
    },
    port: {
        alias: 'p',
        desc: 'automation driver port',
        type: 'number'
    },
    path: {
        type: 'string',
        default: '/wd/hub',
        desc: 'path to WebDriver endpoints (default /wd/hub)'
    },
    user: {
        alias: 'u',
        desc: 'username if using a cloud service as automation backend',
        type: 'string'
    },
    key: {
        alias: 'k',
        desc: 'corresponding access key to the user',
        type: 'string'
    },
    logLevel: {
        alias: 'l',
        desc: 'level of logging verbosity',
        choices: ['trace', 'debug', 'info', 'warn', 'error', 'silent']
    },
    bail: {
        desc: 'stop test runner after specific amount of tests have failed',
        type: 'number'
    },
    baseUrl: {
        desc: 'shorten url command calls by setting a base url',
        type: 'string'
    },
    waitforTimeout: {
        alias: 'w',
        desc: 'timeout for all waitForXXX commands',
        type: 'number'
    },
    framework: {
        alias: 'f',
        desc: 'defines the framework (Mocha, Jasmine or Cucumber) to run the specs',
        type: 'string'
    },
    reporters: {
        alias: 'r',
        desc: 'reporters to print out the results on stdout',
        type: 'array'
    },
    suite: {
        desc: 'overwrites the specs attribute and runs the defined suite',
        type: 'array'
    },
    spec: {
        desc: 'run only a certain spec file - overrides specs piped from stdin',
        type: 'array'
    },
    exclude: {
        desc: 'exclude certain spec file from the test run - overrides exclude piped from stdin',
        type: 'array'
    },
    mochaOpts: {
        desc: 'Mocha options'
    },
    jasmineNodeOpts: {
        desc: 'Jasmine options'
    },
    cucumberOpts: {
        desc: 'Cucumber options'
    }
}

export const builder = (yargs) => {
    return yargs
        .options(cmdArgs)
        .example('$0 run wdio.conf.js --suite foobar', 'Run suite on testsuite "foobar"')
        .example('$0 run wdio.conf.js --spec ./tests/e2e/a.js --spec ./tests/e2e/b.js', 'Run suite on specific specs')
        .example('$0 run wdio.conf.js --mochaOpts.timeout 60000', 'Run suite with custom Mocha timeout')
        .epilogue(CLI_EPILOGUE)
        .help()
}

export function launchWithStdin(wdioConfPath, params) {
    let stdinData = ''
    const stdin = process.openStdin()

    stdin.setEncoding('utf8')
    stdin.on('data', (data) => {
        stdinData += data
    })
    stdin.on('end', () => {
        if (stdinData.length > 0) {
            params.specs = stdinData.trim().split(/\r?\n/)
        }
        launch(wdioConfPath, params)
    })
}

export function launch(wdioConfPath, params) {
    const launcher = new Launcher(wdioConfPath, params)
    return launcher.run()
        .then((...args) => {
            /* istanbul ignore if */
            if (!process.env.JEST_WORKER_ID) {
                process.exit(...args)
            }
        })
        .catch(err => {
            console.error(err)
            /* istanbul ignore if */
            if (!process.env.JEST_WORKER_ID) {
                process.exit(1)
            }
        })
}

export async function handler(argv) {
    const { configPath, ...params } = argv

    if (!fs.existsSync(configPath)) {
        await missingConfigurationPrompt('run', `No WebdriverIO configuration found in "${configPath}"`)
    }

    const localConf = path.join(process.cwd(), 'wdio.conf.js')
    const wdioConf = configPath || (fs.existsSync(localConf) ? localConf : null)

    /**
     * if `--watch` param is set, run launcher in watch mode
     */
    if (params.watch) {
        const watcher = new Watcher(wdioConf, params)
        return watcher.watch()
    }

    /**
     * if stdin.isTTY, then no piped input is present and launcher should be
     * called immediately, otherwise piped input is processed, expecting
     * a list of files to process.
     *
     * stdin.isTTY is false when command is from nodes spawn since it's treated as a pipe
     */
    if (process.stdin.isTTY || !process.stdout.isTTY) {
        return launch(wdioConf, params)
    }

    /*
     * get a list of spec files to run from stdin, overriding any other
     * configuration suite or specs.
     */
    launchWithStdin(wdioConf, params)
}
