'use strict';

const {promises: fsp} = require('fs');
const path = require('path');
const zlib = require('zlib');
const {promisify} = require('util');

const core = require('@actions/core');
const github = require('@actions/github');

const main = async () => {
  const [OWNER, REPO] = process.env.GITHUB_REPOSITORY.split('/'),
    PATH = core.getInput('path'),
    PREFIX = core.getInput('prefix'),
    SUFFIX = core.getInput('suffix'),
    TAG = /^refs\/tags\/(.*)$/.exec(process.env.GITHUB_REF)[1];

  const fileName = `${PREFIX}${process.platform}-${process.arch}-${process.versions.modules}${SUFFIX}`;

  console.log('Preparing artifact', fileName, '...');

  const octokit = new github.GitHub(process.env.GITHUB_TOKEN);

  const [data, uploadUrl] = await Promise.all([
    fsp.readFile(path.normalize(PATH)),
    octokit.repos.getReleaseByTag({owner: OWNER, repo: REPO, tag: TAG}).then(response => response.data.upload_url)
  ]);

  console.log('Compressing and uploading ...');

  await Promise.all([
    (async () => {
      if (!zlib.brotliCompress) return null;
      const compressed = await promisify(zlib.brotliCompress)(data, {params: {[zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY}});
      return octokit.repos
        .uploadReleaseAsset({
          url: uploadUrl,
          data: compressed,
          name: fileName + '.br',
          headers: {'content-type': 'application/brotli', 'content-length': compressed.length}
        })
        .then(() => console.log('Uploaded BR.'))
        .catch(() => console.log('BR has failed to upload.'));
    })(),
    (async () => {
      if (!zlib.gzip) return null;
      const compressed = await promisify(zlib.gzip)(data, {level: zlib.constants.Z_BEST_COMPRESSION});
      return octokit.repos
        .uploadReleaseAsset({
          url: uploadUrl,
          data: compressed,
          name: fileName + '.gz',
          headers: {'content-type': 'application/gzip', 'content-length': compressed.length}
        })
        .then(() => console.log('Uploaded GZ.'))
        .catch(() => console.log('GZ has failed to upload.'));
    })()
  ]);
  console.log('Done.');
};

main().catch(e => core.setFailed((e && e.message) || 'create-binary-asset has failed'));