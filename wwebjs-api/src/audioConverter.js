const ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('ffmpeg-static')
const { Readable } = require('stream')

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath)

/**
 * Convert audio to Opus format (audio/ogg; codecs=opus) required for WhatsApp voice messages
 * @param {string} base64Audio - Base64 encoded audio data
 * @param {string} inputMimetype - Original audio mimetype (e.g., 'audio/mp3', 'audio/mpeg')
 * @returns {Promise<string>} - Base64 encoded Opus audio data
 */
const convertToOpus = (base64Audio, inputMimetype) => {
  return new Promise((resolve, reject) => {
    try {
      // Decode base64 to buffer
      const audioBuffer = Buffer.from(base64Audio, 'base64')
      
      // Create readable stream from buffer
      const inputStream = new Readable()
      inputStream.push(audioBuffer)
      inputStream.push(null)

      // Determine input format from mimetype
      let inputFormat = 'mp3'
      if (inputMimetype) {
        const mimeMap = {
          'audio/mpeg': 'mp3',
          'audio/mp3': 'mp3',
          'audio/wav': 'wav',
          'audio/wave': 'wav',
          'audio/x-wav': 'wav',
          'audio/aac': 'aac',
          'audio/m4a': 'm4a',
          'audio/mp4': 'mp4',
          'audio/ogg': 'ogg',
          'audio/webm': 'webm'
        }
        inputFormat = mimeMap[inputMimetype.toLowerCase().split(';')[0].trim()] || 'mp3'
      }

      const chunks = []

      // Convert audio to opus format
      ffmpeg(inputStream)
        .inputFormat(inputFormat)
        .audioCodec('libopus')
        .audioBitrate('64k')
        .audioChannels(1)
        .audioFrequency(48000)
        .format('ogg')
        .on('error', (err) => {
          reject(new Error(`Audio conversion failed: ${err.message}`))
        })
        .on('end', () => {
          const outputBuffer = Buffer.concat(chunks)
          const base64Output = outputBuffer.toString('base64')
          resolve(base64Output)
        })
        .pipe()
        .on('data', (chunk) => {
          chunks.push(chunk)
        })
    } catch (error) {
      reject(new Error(`Audio conversion setup failed: ${error.message}`))
    }
  })
}

/**
 * Check if audio needs conversion for voice message
 * @param {string} mimetype - Audio mimetype
 * @returns {boolean} - True if conversion is needed
 */
const needsConversion = (mimetype) => {
  if (!mimetype) return true
  const normalizedMime = mimetype.toLowerCase().trim()
  // WhatsApp voice messages require audio/ogg with opus codec
  return !normalizedMime.includes('audio/ogg') || !normalizedMime.includes('opus')
}

module.exports = {
  convertToOpus,
  needsConversion
}
