'use strict';
var path = require('path'),
    fs = require('fs'),
    AV = require('avoscloud-sdk'),
    childProcess = require('child_process');

exports.detect = function(appPath, cb) {
  if (fs.existsSync(path.join(appPath, 'cloud', 'main.js'))){ // cloud code v2.0
    return getCloudCodeRuntimeInfo(appPath, cb);
  } else if (fs.existsSync(path.join(appPath, 'server.js')) || fs.existsSync(path.join(appPath, 'package.json'))) { // Node.js
    return getNodeRuntimeInfo(appPath, cb);
  } else if (fs.existsSync(path.join(appPath, 'requirements.txt')) &&
             fs.existsSync(path.join(appPath, 'wsgi.py'))) { // Python
    return getPythonRuntimeInfo(appPath, cb);
  } else if (fs.existsSync(path.join(appPath, 'composer.json')) &&
             fs.existsSync(path.join(appPath, 'public/index.php'))) {
    return getPhpRuntimeInfo(appPath, cb);
  } else if (fs.existsSync(path.join(appPath, 'pom.xml'))) {
    return getJavaRuntimeInfo(appPath, cb);
  } else {
    cb(new Error('不在 LeanEngine 项目根目录，或目录结构不对。'));
  }
};

var getCloudCodeRuntimeInfo = function(appPath, cb) {
  var runjs = path.join(path.dirname(fs.realpathSync(__filename)), '../bin/cloudcodeRun.js');
  cb(null, {
    runtime: 'cloudcode',
    exec: 'node',
    setDebug: function(debug) {
      if (debug) {
        this.exec = 'node debug';
      }
    },
    getMonconfig: function(args, port) {
      return {
        exec: this.exec,
        ignore: [
          '.git',
          'node_modules/**/node_modules'
        ],
        "env": getCommonEnvironments(AV, port),
        watch: [
          'cloud/'
        ],
        ext: 'js json coffee',
        script: runjs,
        args: args
      };
    },
    bulk: function() {
      return [{ src: ['package.json', 'cloud/**', 'config/**', 'public/**']}];
    }
  });
};

var getNodeRuntimeInfo = function(appPath, cb) {
  var exec = 'node';
  var script = 'server.js';
  var packageObj = {};
  var packageFile = path.join(appPath, 'package.json');
  if(fs.existsSync(packageFile)) {
    packageObj = require(packageFile);
    if (packageObj.scripts && packageObj.scripts.start) {
      exec = 'npm';
      script = 'start';
    }
  }
  cb(null, {
    runtime: 'nodejs',
    exec: exec,
    setDebug: function(debug) {
      if (debug) {
        this.exec = 'node debug';
        if (packageObj.scripts && packageObj.scripts.start) {
          if (packageObj.scripts.start.match(/^node/))
            script = packageObj.scripts.start.replace(/^node/, '').trim();
          else
            throw new Error('启动调试模式需要 package.json 中 scripts.start 以 node 开头');
        }
      }
    },
    getMonconfig: function(args, port) {
      return {
        exec: this.exec,
        ignore: [
          '.git',
          'node_modules/**/node_modules'
        ],
        "env": getCommonEnvironments(AV, port),
        ext: 'js json coffee',
        script: script,
        args: args
      };
    },
    bulk: function() {
      return [{ src: ['**', '!node_modules/**', '**/.babelrc']}];
    }
  });
};

var getPythonRuntimeInfo = function(appPath, cb) {
  var exec = 'python2.7';
  if (fs.existsSync(path.join(appPath, 'runtime.txt'))) {
    var runtimeTxt = fs.readFileSync('runtime.txt', {encoding: 'utf-8'});
    if (runtimeTxt.startsWith('python-2.7')) {
      exec = 'python2.7';
    } else if (runtimeTxt.startsWith('python-3.5')) {
      exec = 'python3.5';
    } else {
      cb(new Error('invalid runtime.txt format, only `python-2.7` and `python-3.5` is supported'));
    }
  }
  try {
    // execSync by default will be output to the parent process' stderr unless stdio is specified
    childProcess.execSync(exec + ' --version', {stdio: []});
  } catch (err) {
    console.log(exec + ' command not found, fallback to `python`');
    exec = 'python';
  }
  cb(null, {
    runtime: 'python',
    exec: exec,
    setDebug: function(debug) {
      if (debug) {
        this.exec = 'python -m pdb';
      }
    },
    getMonconfig: function(args, port) {
      return {
        exec: this.exec,
        ignore: [
          '.git'
        ],
        "env": getCommonEnvironments(AV, port),
        ext: 'py',
        script: 'wsgi.py',
        args: args
      };
    },
    bulk: function() {
      return [{ src: ['**', '!bin/**', '!include/**', '!lib/**', '!pip-selfcheck.json']}];
    }
  });
};

var getPhpRuntimeInfo = function(appPath, cb) {
  cb(null, {
    runtime: 'php',
    exec: 'php -S 127.0.0.1:3000 -t public',
    setDebug: function(debug) {
      if (debug) {
        console.log('php does not support debug currently');
      }
    },
    getMonconfig: function(args, port) {
      return {
        exec: this.exec,
        ignore: [
          '.git'
        ],
        "env": getCommonEnvironments(AV, port),
        ext: 'php',
        script: __dirname + '/router.php',
        args: args
      };
    },
    bulk: function() {
      return [{ src: ['**', '!vendor']}];
    }
  })
};

var getJavaRuntimeInfo = function(appPath, cb) {
  var exec = 'java';
  var pom = fs.readFileSync('pom.xml', {encoding: 'utf-8'});
  var match = pom.match(/\<packaging\>(.*)\<\/packaging\>/)
  if(match && match[1] === 'war') {
  } else {
    return cb(new Error('invalid pom package format, only `<packaging>war</packaging>` is supported'));
  }
  cb(null, {
    runtime: 'java',
    exec: 'mvn',
    setDebug: function(debug) {},
    getMonconfig: function(args, port) {
      return {
        exec: this.exec,
        "env": getCommonEnvironments(AV, port),
        watch: [
          'pom.xml'
        ],
        script: 'jetty:run',
        args: args
      };
    },
    bulk: function() {
      return [{ src: ['**', '!target/**']}];
    }
  });
};

function getCommonEnvironments(AV, port) {
  return {
    LC_APP_ID: AV.applicationId,
    LC_APP_KEY: AV.applicationKey,
    LC_APP_MASTER_KEY: AV.masterKey,
    LC_APP_PORT: port,
    LC_API_SERVER: AV._config.APIServerURL,
    LEANCLOUD_APP_ID: AV.applicationId,
    LEANCLOUD_APP_KEY: AV.applicationKey,
    LEANCLOUD_APP_MASTER_KEY: AV.masterKey,
    LEANCLOUD_APP_PORT: port,
    LEANCLOUD_API_SERVER: AV._config.APIServerURL,
    LEANCLOUD_APP_ENV: 'development',
    LEANCLOUD_REGION: AV._config.region
  };
}
