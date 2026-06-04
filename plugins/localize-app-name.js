const { withInfoPlist, withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const NAMES = {
  en: 'InkVoice',
  zh: '墨声',
};

function withIosLocalizedAppName(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults.CFBundleLocalizations = Object.keys(NAMES);
    return c;
  });

  config = withDangerousMod(config, ['ios', (c) => {
    const projectDir = c.modRequest.platformProjectRoot;
    for (const [locale, name] of Object.entries(NAMES)) {
      const lprojDir = path.join(projectDir, `${locale}.lproj`);
      fs.mkdirSync(lprojDir, { recursive: true });
      fs.writeFileSync(path.join(lprojDir, 'InfoPlist.strings'), `CFBundleDisplayName = "${name}";\n`);
    }
    return c;
  }]);

  config = withXcodeProject(config, (c) => {
    const proj = c.modResults;
    const objects = proj.hash.project.objects;

    const variantGroups = objects['PBXVariantGroup'] || {};
    if (Object.values(variantGroups).some((g) => g.name === 'InfoPlist.strings')) {
      return c;
    }

    const fileRefs = Object.keys(NAMES).map((locale) => {
      const uuid = proj.generateUuid();
      objects['PBXFileReference'] = objects['PBXFileReference'] || {};
      objects['PBXFileReference'][uuid] = {
        isa: 'PBXFileReference',
        lastKnownFileType: 'text.plist.strings',
        name: locale,
        path: `${locale}.lproj/InfoPlist.strings`,
        sourceTree: '"<group>"',
      };
      return { value: uuid, comment: locale };
    });

    const variantGroupUUID = proj.generateUuid();
    objects['PBXVariantGroup'] = objects['PBXVariantGroup'] || {};
    objects['PBXVariantGroup'][variantGroupUUID] = {
      isa: 'PBXVariantGroup',
      children: fileRefs,
      name: 'InfoPlist.strings',
      sourceTree: '"<group>"',
    };

    const mainGroupKey = proj.getFirstProject().firstProject.mainGroup;
    const mainGroup = proj.getPBXGroupByKey(mainGroupKey);
    if (mainGroup && !mainGroup.children.find((ch) => ch.comment === 'InfoPlist.strings')) {
      mainGroup.children.push({ value: variantGroupUUID, comment: 'InfoPlist.strings' });
    }

    const buildFileUUID = proj.generateUuid();
    objects['PBXBuildFile'] = objects['PBXBuildFile'] || {};
    objects['PBXBuildFile'][buildFileUUID] = {
      isa: 'PBXBuildFile',
      fileRef: variantGroupUUID,
      fileRef_comment: 'InfoPlist.strings',
    };

    const target = proj.getFirstTarget();
    if (target) {
      const resourcesPhase = proj.pbxResourcesBuildPhaseObj(target.uuid);
      if (resourcesPhase && !resourcesPhase.files.find((f) => f.comment === 'InfoPlist.strings in Resources')) {
        resourcesPhase.files.push({ value: buildFileUUID, comment: 'InfoPlist.strings in Resources' });
      }
    }

    return c;
  });

  return config;
}

function withAndroidLocalizedAppName(config) {
  return withDangerousMod(config, ['android', (c) => {
    const resDir = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');

    const valuesDir = path.join(resDir, 'values');
    fs.mkdirSync(valuesDir, { recursive: true });
    fs.writeFileSync(
      path.join(valuesDir, 'strings.xml'),
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">${NAMES.en}</string>\n</resources>\n`
    );

    const zhDir = path.join(resDir, 'values-zh');
    fs.mkdirSync(zhDir, { recursive: true });
    fs.writeFileSync(
      path.join(zhDir, 'strings.xml'),
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">${NAMES.zh}</string>\n</resources>\n`
    );

    return c;
  }]);
}

module.exports = function withLocalizedAppName(config) {
  config = withIosLocalizedAppName(config);
  config = withAndroidLocalizedAppName(config);
  return config;
};
