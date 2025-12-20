const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const projectRoot = path.resolve(__dirname, '..')

async function main() {
  try {
    console.log('📦 Starting postinstall script...')

    // Try to resolve chromium package location
    let chromiumPath
    try {
      chromiumPath = require.resolve('@sparticuz/chromium')
    } catch (err) {
      console.log('⚠️  @sparticuz/chromium not found, skipping archive creation')
      console.log('   This is normal for local development')
      return
    }

    // Get the package root directory (goes up from build/index.js to package root)
    const chromiumDir = path.dirname(path.dirname(chromiumPath))
    const binDir = path.join(chromiumDir, 'bin')

    if (!fs.existsSync(binDir)) {
      console.log('⚠️  Chromium bin directory not found, skipping archive creation')
      return
    }

    // Create public folder if it doesn't exist
    const publicDir = path.join(projectRoot, 'public')
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true })
    }

    const outputPath = path.join(publicDir, 'chromium-pack.tar')

    console.log('📦 Creating chromium tar archive...')
    console.log('   Source:', binDir)
    console.log('   Output:', outputPath)

    // Tar the contents of bin/ directly (without bin prefix)
    // Use cross-platform approach: check if tar is available
    try {
      execSync(`tar -cf "${outputPath}" -C "${binDir}" .`, {
        stdio: 'inherit',
        cwd: projectRoot
      })
      console.log('✅ Chromium archive created successfully!')
    } catch (tarError) {
      console.log('⚠️  tar command failed, this may be a Windows system')
      console.log('   Chromium archive will be created during deployment')
    }
  } catch (error) {
    console.error('❌ Failed to create chromium archive:', error.message)
    console.log('⚠️  This is not critical for local development')
    // Don't fail the install
  }
}

main()
