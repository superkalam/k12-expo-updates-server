const FormData = require('form-data')
const { serializeDictionary } = require('structured-headers')
const Err = require('@feathersjs/errors')
const { getRequestParams } = require('./request')
const { getMetadataSync, convertSHA256HashToUUID, getAssetMetadataSync, signRSASHA256, convertToDictionaryItemsRepresentation } = require('./helpers')

const getSignature = async ({ headers, manifest, privateKey }) => {
  const expectSignatureHeader = !!headers['expo-expect-signature']
  if (!expectSignatureHeader) return ({})

  if (!privateKey) {
    throw new Err.BadRequest('Code signing requested but no key supplied when starting server.')
  }
  const manifestString = JSON.stringify(manifest)
  const hashSignature = signRSASHA256(manifestString, privateKey)
  const dictionary = convertToDictionaryItemsRepresentation({
    sig: hashSignature,
    keyid: 'main'
  })
  return ({ 'expo-signature': serializeDictionary(dictionary) })
}

module.exports.hanldeManifestData = async (app, { query, headers }) => {
  const {
    project,
    platform,
    runtimeVersion,
    releaseChannel
  } = getRequestParams({ query, headers })

  const [update] = await app.service('uploads').find({ query: { project, version: runtimeVersion, releaseChannel, status: 'released' } })
  if (!update) return { message: 'No uploads found' }

  const application = await app.service('apps').get(update.project)
  if (!application) return { message: 'No application found' }

  try {
    const { metadataJson, createdAt, id } = getMetadataSync(update)

    const platformSpecificMetadata = metadataJson.fileMetadata[platform]
    if (!platformSpecificMetadata) {
      console.error('[MANIFEST] No platform-specific metadata found for platform:', platform)
      console.error('[MANIFEST] Available platforms:', Object.keys(metadataJson.fileMetadata || {}))
      throw new Error(`No metadata found for platform: ${platform}`)
    }
    const manifest = {
      id: convertSHA256HashToUUID(id),
      createdAt,
      runtimeVersion,
      assets: platformSpecificMetadata.assets.map((asset) =>
        getAssetMetadataSync({
          update,
          filePath: asset.path,
          ext: asset.ext,
          runtimeVersion,
          platform,
          isLaunchAsset: false
        })
      ),
      launchAsset: getAssetMetadataSync({
        update,
        filePath: platformSpecificMetadata.bundle,
        isLaunchAsset: true,
        runtimeVersion,
        platform,
        ext: null
      })
    }

    const assetRequestHeaders = {};
    [...manifest.assets, manifest.launchAsset].forEach((asset) => {
      assetRequestHeaders[asset.key] = {
        'test-header': 'test-header-value'
      }
    })

    const form = new FormData()

    form.append('manifest', JSON.stringify(manifest), {
      contentType: 'application/json',
      header: {
        'content-type': 'application/json; charset=utf-8',
        ...(await getSignature({ headers, manifest, privateKey: application.privateKey }))
      }
    })

    form.append('extensions', JSON.stringify({ assetRequestHeaders }), {
      contentType: 'application/json'
    })

    return {
      type: 'manifest',
      formBoundary: form.getBoundary(),
      formData: form.getBuffer().toString()
    }
  } catch (error) {
    console.error('[MANIFEST] Error generating manifest:', {
      message: error.message,
      stack: error.stack,
      context: { project, platform, runtimeVersion, releaseChannel }
    })
    throw new Err.BadRequest(`Manifest generation failed: ${error.message}`)
  }
}

module.exports.handleManifestResponse = (res) => {
  res.set('expo-protocol-version', 0)
  res.set('expo-sfv-version', 0)
  res.set('cache-control', 'private, max-age=0')
  res.set('content-type', `multipart/mixed; boundary=${res.data.formBoundary}`)
  const buffer = Buffer.from(res.data.formData)
  res.write(buffer)
  res.end()
}
