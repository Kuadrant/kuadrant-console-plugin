#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const constantsPath = path.join('src', 'constants', 'links.ts');
const localesPath = path.join('locales');
const localeFile = path.join(localesPath, 'en', 'plugin__kuadrant-console-plugin.json');

const upstreamName = 'Kuadrant';
const downstreamName = 'Connectivity Link';

const upstreamDocumentation = 'https://docs.kuadrant.io';
const upstreamReleaseNotes = 'https://github.com/Kuadrant/kuadrant-operator/releases';
const upstreamQuickStarts =
  'https://docs.kuadrant.io/latest/kuadrant-operator/doc/user-guides/secure-protect-connect/';
const upstreamHighlights = 'https://kuadrant.io/blog/';

const downstreamDocumentation =
  'https://docs.redhat.com/en/documentation/red_hat_connectivity_link/1.0';
const downstreamReleaseNotes =
  'https://docs.kuadrant.io/html-single/release_notes_for_connectivity_link_1.0/index';
const downstreamQuickStarts =
  'https://docs.redhat.com/latest/red-hat-connectivity-link/doc/user-guides/secure-protect-connect/'; // Example
const downstreamHighlights = 'https://connectivity-link.io/blog/'; // Example

const isUpstream = process.argv.includes('--upstream');

const nameToReplace = isUpstream ? downstreamName : upstreamName;
const nameToInsert = isUpstream ? upstreamName : downstreamName;
const docsLinkToReplace = isUpstream ? downstreamDocumentation : upstreamDocumentation;
const docsLinkToInsert = isUpstream ? upstreamDocumentation : downstreamDocumentation;
const releaseNotesToReplace = isUpstream ? downstreamReleaseNotes : upstreamReleaseNotes;
const releaseNotesToInsert = isUpstream ? upstreamReleaseNotes : downstreamReleaseNotes;
const quickStartsToReplace = isUpstream ? downstreamQuickStarts : upstreamQuickStarts;
const quickStartsToInsert = isUpstream ? upstreamQuickStarts : downstreamQuickStarts;
const highlightsToReplace = isUpstream ? downstreamHighlights : upstreamHighlights;
const highlightsToInsert = isUpstream ? upstreamHighlights : downstreamHighlights;

function updateJsonValues(filePath, searchValue, replaceValue) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const jsonContent = JSON.parse(content);

    let updated = false;

    Object.keys(jsonContent).forEach((key) => {
      if (jsonContent[key].includes(searchValue)) {
        jsonContent[key] = jsonContent[key].replace(new RegExp(searchValue, 'g'), replaceValue);
        updated = true;
      }
    });

    if (updated) {
      fs.writeFileSync(filePath, JSON.stringify(jsonContent, null, 2));
      console.log(`Updated values in ${filePath}`);
    } else {
      console.log(`No changes made to ${filePath}`);
    }
  } catch (error) {
    console.error(`Failed to update ${filePath}: ${error}`);
  }
}

function updateFileContent(filePath, replacements) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    let updatedContent = content;

    replacements.forEach(({ searchValue, replaceValue }) => {
      updatedContent = updatedContent.replace(new RegExp(searchValue, 'g'), replaceValue);
    });

    if (content !== updatedContent) {
      fs.writeFileSync(filePath, updatedContent);
      console.log(`Updated content in ${filePath}`);
    } else {
      console.log(`No changes made to ${filePath}`);
    }
  } catch (error) {
    console.error(`Failed to update ${filePath}: ${error}`);
  }
}

console.log(`Updating locale files to ${isUpstream ? 'upstream' : 'downstream'}...`);
updateJsonValues(localeFile, nameToReplace, nameToInsert);

console.log(`Updating constants.links.ts to ${isUpstream ? 'upstream' : 'downstream'}...`);

updateFileContent(constantsPath, [
  { searchValue: docsLinkToReplace, replaceValue: docsLinkToInsert },
  { searchValue: releaseNotesToReplace, replaceValue: releaseNotesToInsert },
  { searchValue: quickStartsToReplace, replaceValue: quickStartsToInsert },
  { searchValue: highlightsToReplace, replaceValue: highlightsToInsert },
]);

console.log('Update complete!');
