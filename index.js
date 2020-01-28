function createConstitutionFromSources(sources, options, callback) {
    const child_process = require('child_process');
    const path = require('path');
    const fs = require('fs');
    const pskBuildPath = path.resolve(path.join(__dirname, '../../psknode/bin/scripts/pskbuild.js'));

    let internalOptions = {
        constitutionName: 'constitution',
        outputFolder: null,
        cleanupTmpDir: true
    };

    if (typeof sources === 'string') {
        sources = [sources];
    }

    if (typeof options === 'function') {
        callback = options;
    } else if (typeof options === 'string') {
        internalOptions.outputFolder = options;
    } else if (typeof options === 'object') {
        Object.assign(internalOptions, options);
    }

    let sourcesNames = [];
    let sourcesPaths = [];

    if (sources && sources.length && sources.length > 0) {
        sourcesNames = sources.map(source => path.basename(source));
        sourcesPaths = sources.map(source => path.dirname(source));
    }

    sourcesNames = sourcesNames.join(',');
    sourcesPaths = sourcesPaths.join(',');

    const projectMap = {
        [internalOptions.constitutionName]: {"deps": sourcesNames, "autoLoad": true},
    };

    getTmpDir('PSK_DOMAIN-', (err, tmpFolder) => {
        if (err) {
            return callback(err);
        }

        const projectMapPath = path.join(tmpFolder, 'projectMap.json');
        fs.writeFile(projectMapPath, JSON.stringify(projectMap), 'utf8', (err) => {
            if (err) {
                return callback(err);
            }

            let outputFolder = null;

            if (internalOptions.outputFolder) {
                outputFolder = internalOptions.outputFolder;
            } else {
                internalOptions.cleanupTmpDir = false;
                outputFolder = tmpFolder;
            }

            child_process.exec(`node ${pskBuildPath} --projectMap=${projectMapPath} --source=${sourcesPaths} --output=${outputFolder}`, (err) => {
                if (err) {
                    return callback(err);
                }

                callback(undefined, path.join(outputFolder, `${internalOptions.constitutionName}.js`));

                if (internalOptions.cleanupTmpDir) {
                    fs.rmdir(tmpFolder, {recursive: true}, (err) => {
                        if (err) {
                            console.warn(`Failed to delete temporary folder "${tmpFolder}"`);
                        }
                    });
                }
            });
        });
    });
}

function deployConstitutionCSB(constitutionBundle, callback) {
    const EDFS = require('edfs');
    const brickStorageStrategyName = "http";

    const edfs = EDFS.attach(brickStorageStrategyName);

    edfs.createCSB((err, constitutionCSB) => {
        if (err) {
            return callback(err);
        }

        addFilesToArchive(constitutionBundle, constitutionCSB, willReturnSeed(constitutionCSB, callback));
    });
}

function deployConstitutionFolderCSB(constitutionFolder, callback) {
    const fs = require('fs');
    const path = require('path');
    fs.readdir(constitutionFolder, (err, files) => {
        if(err) {
            return callback(err);
        }

        files = files.map(file => path.join(constitutionFolder, file));
        deployConstitutionCSB(files, callback);
    });
}

function deployConstitutionBar(constitutionBundle, callback) {
    const EDFS = require('edfs');
    const brickStorageStrategyName = "http";

    const edfs = EDFS.attach(brickStorageStrategyName);
    const constitutionBAR = edfs.createBar();

    addFilesToArchive(constitutionBundle, constitutionBAR, willReturnSeed(constitutionBAR, callback));

}

function getConstitutionFilesFromBar(seed, callback) {
    const EDFS = require('edfs');
    const brickStorageStrategyName = "http";

    const edfs = EDFS.attach(brickStorageStrategyName);
    const constitutionBAR = edfs.loadBar(seed);

    getConstitutionFilesFrom(constitutionBAR, callback)
}

function getConstitutionFilesFromCSB(seed, callback) {
    loadCSB(seed, (err, constitutionCSB) => {
        if (err) {
            return callback(err);
        }

        getConstitutionFilesFrom(constitutionCSB, callback);
    });
}

function ensureEnvironmentIsReady(edfsURL) {
    const EDFS = require('edfs');
    const brickStorageStrategyName = "http";

    if (!$$.securityContext) {
        $$.securityContext = require("psk-security-context").createSecurityContext();
    }

    const hasHttpStrategyRegistered = $$.brickTransportStrategiesRegistry.has(brickStorageStrategyName);

    if (!hasHttpStrategyRegistered) {
        $$.brickTransportStrategiesRegistry.add(brickStorageStrategyName, new EDFS.HTTPBrickTransportStrategy(edfsURL));
    }
}

function loadCSB(seed, callback) {
    const EDFS = require('edfs');
    const Seed = require('bar').Seed;
    const brickStorageStrategyName = "http";

    const seedObject = new Seed(seed);
    ensureEnvironmentIsReady(seedObject.getEndpoint());

    const edfs = EDFS.attach(brickStorageStrategyName);
    edfs.loadCSB(seed, callback);
}

function createCSB(callback) {
    const EDFS = require('edfs');
    const brickStorageStrategyName = "http";

    const edfs = EDFS.attach(brickStorageStrategyName);

    edfs.createCSB(callback);
}

/****************************** UTILITY FUNCTIONS ******************************/

function addFilesToArchive(files, archive, callback) {
    const EDFS = require('edfs');
    const path = require('path');

    if (typeof files === 'string') {
        files = [files];
    }

    asyncReduce(files, __addFile, null, callback);

    function __addFile(_, filePath, callback) {
        archive.addFile(filePath, `${EDFS.constants.CSB.CONSTITUTION_FOLDER}/` + path.basename(filePath), callback);
    }
}

function getConstitutionFrom(csb, cb){
    getConstitutionFilesFrom(csb, undefined, cb);
}


function getConstitutionFilesFrom(archive, specifiedFiles, callback) {
    const EDFS = require('edfs');
    const path = require('path');

    if(typeof specifiedFiles === 'function') {
        callback = specifiedFiles;
    }

    archive.listFiles(EDFS.constants.CSB.CONSTITUTION_FOLDER, (err, files) => {
        if (err) {
            return callback(err);
        }

        files = files.filter(file => specifiedFiles.includes(path.basename(file)));
        asyncReduce(files, __readFile, {}, callback);
    });


    function __readFile(pastFilesContent, filePath, callback) {
        archive.readFile(filePath, (err, fileContent) => {
            if (err) {
                return callback(err);
            }

            pastFilesContent[path.basename(filePath)] = fileContent;
            callback();
        });
    }
}

function willReturnSeed(archive, callback) {
    return function (err) {
        if (err) {
            return callback(err);
        }

        const seed = archive.getSeed();
        callback(undefined, seed);
    }
}

/**
 * Traverse an array and collects result from calling handler on each array of the element
 * It's similar to Array.prototype.reduce but it's asynchronous
 */
function asyncReduce(array, handler, currentValue, callback) {
    function __callNext(index = 0) {
        if (index >= array.length) {
            return callback(undefined, currentValue);
        }

        handler(currentValue, array[index], (err, newCurrentValue) => {
            if (err) {
                return callback(err);
            }

            if (newCurrentValue) {
                currentValue = newCurrentValue;
            }

            __callNext(index + 1);
        })
    }

    __callNext();
}

function getTmpDir(dirNamePrefix, callback) {
    const path = require('path');
    const os = require('os');
    const fs = require('fs');

    const tmpFolder = os.tmpdir();
    fs.mkdtemp(path.join(tmpFolder, dirNamePrefix), callback);
}

module.exports = {
    createConstitutionFromSources,
    deployConstitutionBar,
    deployConstitutionCSB,
    deployConstitutionFolderCSB,
    ensureEnvironmentIsReady,
    getConstitutionFilesFromBar,
    getConstitutionFilesFromCSB,
    loadCSB,
    createCSB,
    getConstitutionFrom,
    getConstitutionFilesFrom
};
