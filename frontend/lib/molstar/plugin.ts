/**
 * Mol* plugin construction, kept out of `components/molstar-viewer.tsx` for the
 * same reason `lib/molstar/actions.ts` is: none of it is React, and the
 * component is meant to stay a thin ref-forwarding shell (CONTRIBUTING.md section 3
 * caps components at 200 LOC).
 */

import { createPluginUI } from "molstar/lib/mol-plugin-ui";
import { renderReact18 } from "molstar/lib/mol-plugin-ui/react18";
import { DefaultPluginUISpec } from "molstar/lib/mol-plugin-ui/spec";
import { ElectrostaticsColorThemeProvider } from "@/lib/molstar/electrostatics-theme";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { Color } from "molstar/lib/mol-util/color";

/** Reads `--viewer-bg` (a #rrggbb colour set per theme in globals.css). */
function themeBackground(): Color | null {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--viewer-bg")
    .trim();
  const m = /^#([0-9a-f]{6})$/i.exec(raw);
  return m ? Color(parseInt(m[1], 16)) : null;
}

/**
 * Paints the canvas in the theme's viewer colour now and again whenever the
 * theme class on `<html>` changes. Stops once the plugin has been disposed.
 */
function followThemeBackground(plugin: PluginUIContext): void {
  const apply = (): boolean => {
    const canvas = plugin.canvas3d;
    if (!canvas) return false;
    const color = themeBackground();
    if (color !== null) {
      canvas.setProps({ renderer: { backgroundColor: color } });
    }
    return true;
  };
  apply();
  const observer = new MutationObserver(() => {
    if (!apply()) observer.disconnect();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

/**
 * Creates a plugin with every built-in Mol* panel hidden.
 *
 * ProteoLens drives representation, coloring, and selection from its own
 * toolbar and rail, so Mol*'s controls would be a second, desynchronised set of
 * the same knobs. Only the canvas is kept.
 */
export async function createViewerPlugin(
  target: HTMLElement,
): Promise<PluginUIContext> {
  const spec = DefaultPluginUISpec();
  const plugin = await createPluginUI({
    target,
    render: renderReact18,
    spec: {
      ...spec,
      layout: {
        initial: {
          isExpanded: false,
          showControls: false,
          regionState: {
            bottom: "hidden",
            left: "hidden",
            right: "hidden",
            top: "hidden",
          },
        },
      },
    },
  });
  // ProteoLens' own per-residue theme (P15 electrostatics). Registered once
  // per plugin; `applyResidueValueColoring` selects it by name.
  plugin.representation.structure.themes.colorThemeRegistry.add(
    ElectrostaticsColorThemeProvider,
  );
  followThemeBackground(plugin);
  return plugin;
}
