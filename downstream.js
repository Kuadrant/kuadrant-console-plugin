#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Parse command-line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// Define file paths
const constantsPath = path.join('src', 'constants', 'links.ts');
const localesPath = path.join('locales', 'en', 'plugin__kuadrant-console-plugin.json');
const consoleExtensionsPath = path.join('console-extensions.json');

// Replacement mappings
const replacements = {
  // Direct string replacements for links.ts
  [constantsPath]: {
    type: 'simple',
    mappings: {
      // Order matters: specific URLs first to prevent partial matches
      'https://docs.kuadrant.io/latest/getting-started-single-cluster/':
        'https://docs.redhat.com/en/documentation/red_hat_connectivity_link/1.0/html-single/configuring_and_deploying_gateway_policies_with_connectivity_link/index',
      'https://docs.kuadrant.io/latest/kuadrant-operator/doc/observability/examples/':
        'https://docs.redhat.com/en/documentation/red_hat_connectivity_link/1.0/html-single/connectivity_link_observability_guide/index',
      'https://docs.kuadrant.io':
        'https://docs.redhat.com/en/documentation/red_hat_connectivity_link/1.0/',
      'https://github.com/Kuadrant/kuadrant-operator/releases':
        'https://docs.redhat.com/en/documentation/red_hat_connectivity_link/1.0/html-single/release_notes_for_connectivity_link_1.0/index',
      Kuadrant: 'Connectivity Link',
    },
  },

  // Regex-based replacements for console-extensions.json
  [consoleExtensionsPath]: {
    type: 'regex',
    patterns: [
      {
        search: /%plugin__kuadrant-console-plugin~Kuadrant%/g,
        replace: 'Connectivity Link',
      },
    ],
  },

  // Value-only replacements for plugin__kuadrant-console-plugin.json
  [localesPath]: {
    type: 'value',
    replaceValue: 'Connectivity Link', // Replace "Kuadrant" with "Connectivity Link" in values only
  },
};

function replaceSimpleStrings(filePath, mappings) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    let updatedContent = content;
    let changesMade = false;

    Object.entries(mappings).forEach(([search, replace]) => {
      if (content.includes(search)) {
        console.log(`Replacing '${search}' with '${replace}' in ${filePath}`);
        updatedContent = updatedContent.split(search).join(replace);
        changesMade = true;
      }
    });

    if (changesMade) {
      if (!dryRun) {
        fs.writeFileSync(filePath, updatedContent, 'utf-8');
        console.log(`Updated content in ${filePath}`);
      } else {
        console.log(`[Dry Run] Would update content in ${filePath}`);
      }
    } else {
      console.log(`No changes made to ${filePath}`);
    }
  } catch (error) {
    console.error(`Failed to update ${filePath}: ${error.message}`);
  }
}

function replaceWithRegex(filePath, patterns) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    let updatedContent = content;
    let changesMade = false;

    patterns.forEach(({ search, replace }) => {
      if (search.test(updatedContent)) {
        console.log(`Applying regex replacement: ${search} -> ${replace} in ${filePath}`);
        updatedContent = updatedContent.replace(search, replace);
        changesMade = true;
      }
    });

    if (changesMade) {
      if (!dryRun) {
        // Validate JSON integrity
        JSON.parse(updatedContent); // Throws if invalid
        fs.writeFileSync(filePath, updatedContent, 'utf-8');
        console.log(`Updated JSON content in ${filePath}`);
      } else {
        console.log(`[Dry Run] Would update JSON content in ${filePath}`);
      }
    } else {
      console.log(`No changes made to ${filePath}`);
    }
  } catch (error) {
    console.error(`Failed to update ${filePath}: ${error.message}`);
  }
}

function traverseAndReplace(obj, replaceValue) {
  if (typeof obj === 'string') {
    return obj.includes('Kuadrant') ? obj.split('Kuadrant').join(replaceValue) : obj;
  } else if (Array.isArray(obj)) {
    return obj.map((item) => traverseAndReplace(item, replaceValue));
  } else if (typeof obj === 'object' && obj !== null) {
    const newObj = {};
    Object.entries(obj).forEach(([key, value]) => {
      newObj[key] = traverseAndReplace(value, replaceValue);
    });
    return newObj;
  } else {
    return obj;
  }
}

function replaceValuesInJson(filePath, replaceValue) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const jsonData = JSON.parse(content);

    const updatedJsonData = traverseAndReplace(jsonData, replaceValue);

    if (JSON.stringify(jsonData) !== JSON.stringify(updatedJsonData)) {
      if (!dryRun) {
        const updatedContentStr = JSON.stringify(updatedJsonData, null, 2);
        fs.writeFileSync(filePath, updatedContentStr, 'utf-8');
        console.log(`Updated JSON content in ${filePath}`);
      } else {
        console.log(`[Dry Run] Would update JSON content in ${filePath}`);
      }
    } else {
      console.log(`No changes made to ${filePath}`);
    }
  } catch (error) {
    console.error(`Failed to update ${filePath}: ${error.message}`);
  }
}

if (dryRun) {
  console.log('Running in Dry-Run mode. No files will be modified.');
}

Object.entries(replacements).forEach(([filePath, rules]) => {
  switch (rules.type) {
    case 'simple':
      replaceSimpleStrings(filePath, rules.mappings);
      break;
    case 'regex':
      replaceWithRegex(filePath, rules.patterns);
      break;
    case 'value':
      replaceValuesInJson(filePath, rules.replaceValue);
      break;
    default:
      console.warn(`Unknown replacement type for ${filePath}`);
  }
});

console.log('Downstream replacement update complete!');
