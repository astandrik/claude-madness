#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Validate arguments
const validBumpTypes = ['major', 'minor', 'patch'];
const bumpType = process.argv[2];

if (!validBumpTypes.includes(bumpType)) {
    console.error('Please provide a valid version bump type: major, minor, or patch');
    process.exit(1);
}

// Read package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Parse current version
const [major, minor, patch] = packageJson.version.split('.').map(Number);

// Calculate new version
let newVersion;
switch (bumpType) {
    case 'major':
        newVersion = `${major + 1}.0.0`;
        break;
    case 'minor':
        newVersion = `${major}.${minor + 1}.0`;
        break;
    case 'patch':
        newVersion = `${major}.${minor}.${patch + 1}`;
        break;
}

console.log(`Bumping version from ${packageJson.version} to ${newVersion}`);

// Update package.json
packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

try {
    // Run build and package commands
    console.log('Building and packaging extension...');
    execSync('npm run package', { stdio: 'inherit' });
    
    // Create VSIX
    console.log('Creating VSIX file...');
    execSync('vsce package', { stdio: 'inherit' });
    
    console.log(`\nSuccessfully created VSIX for version ${newVersion}`);
    console.log(`You can find the VSIX file in the root directory: claude-madness-${newVersion}.vsix`);
} catch (error) {
    console.error('Error during build or package:', error);
    process.exit(1);
}
