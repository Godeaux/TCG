import * as fs from 'fs';
import * as path from 'path';

/**
 * Scaffolds a new game project in the workspace from a template.
 * Templates define the initial directory structure, starter files,
 * and a project.json that describes the game's architecture to agents.
 */
export class ProjectTemplate {
  /**
   * Apply a template to a workspace directory.
   * @param {string} templateDir - Path to the template directory
   * @param {string} targetDir - Workspace root to scaffold into
   * @param {object} vars - Variables for template interpolation
   */
  static scaffold(templateDir, targetDir, vars = {}) {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(templateDir, 'scaffold.json'), 'utf-8')
    );

    // Create directories
    for (const dir of manifest.directories || []) {
      fs.mkdirSync(path.join(targetDir, dir), { recursive: true });
    }

    // Copy/generate files
    for (const file of manifest.files || []) {
      const content = typeof file.content === 'string'
        ? ProjectTemplate._interpolate(file.content, vars)
        : JSON.stringify(file.content, null, 2);

      fs.writeFileSync(
        path.join(targetDir, file.path),
        content,
        'utf-8'
      );
    }

    // Write project.json — the manifest agents read to understand the project
    const projectJson = {
      name: vars.name || 'untitled-game',
      genre: vars.genre || manifest.genre || 'unknown',
      template: manifest.name,
      modules: manifest.modules || {},
      created: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(targetDir, 'project.json'),
      JSON.stringify(projectJson, null, 2),
      'utf-8'
    );
  }

  static _interpolate(str, vars) {
    return str.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
  }
}
