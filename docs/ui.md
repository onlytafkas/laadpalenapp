# UI Components — shadcn/ui

All UI elements in this app are built exclusively with shadcn/ui. Never create custom components from scratch.

## Rules

- **shadcn/ui only.** Do not build custom UI components. Always use an existing shadcn/ui component or add a new one via the CLI.
- **No custom component primitives.** Do not wrap raw HTML elements (`<div>`, `<button>`, `<input>`, etc.) to replicate what shadcn/ui already provides.
- **Add missing components via CLI.** If a required component is not yet in `components/ui/`, add it with `npx shadcn@latest add <component>`. Never hand-write it.
- **Do not modify files in `components/ui/`.** These are generated and may be overwritten. Extend behaviour by composing components, not by editing them.
- **Style with Tailwind + `cn()`.** Pass additional classes through the `className` prop and merge with `cn()`. Never use inline styles.

## Component Style

This project uses the **radix-nova** style. Always pass `--style radix-nova` (or select it) when adding new components to stay consistent.

## Usage Pattern

Import components directly from their file in `components/ui/`:

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function ExampleForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Example</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Input placeholder="Enter value" />
        <Button>Submit</Button>
      </CardContent>
    </Card>
  );
}
```

## Icons

Use **Lucide React** for all icons — it is the icon library bundled with shadcn/ui. Do not install other icon libraries.

```tsx
import { ChevronRight } from "lucide-react";

<Button>
  Continue <ChevronRight className="ml-2 size-4" />
</Button>
```
