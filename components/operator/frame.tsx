// template-ancestor: components/assessment-flow/stage-column.tsx   (variation: the same geometry, owned by the operator surface — the operator tooling may change without importing the product's flow container)

import type { ReactNode } from "react";

/**
 * The operator surface's column — the one container an operator screen renders inside.
 *
 * **Why a copy exists at all.** The admin screens render inside
 * `components/assessment-flow/stage-column.tsx`, the onboarding flow's container. That import is
 * the largest measured coupling in the operator tree (23 of 23 page modules, before this card):
 * operator tooling could not change its own geometry without editing a product component, and a
 * product change to the flow's width silently re-laid out every console screen.
 *
 * The seam's rule (`tests/operator-seam.test.ts`) is one arrow: an operator file may not import
 * the product shell. This module is the operator side of that arrow — the same element, in a file
 * the operator surface owns.
 *
 * **The geometry is not re-decided here, it is held equal.** `tests/admin-column.test.tsx` renders
 * this component and `StageColumn` with the same child and asserts the two produce **identical
 * markup**, so the copy cannot drift into a second column: a change to the product's width fails
 * that test until this file moves with it, deliberately. What the copy buys is the *import*, not a
 * licence to redesign the console; a screen that spells its own `max-w-*` is still the regression
 * `admin-column.test.tsx` exists to prevent.
 *
 * Left-justified, full width up to 1126px, padding on every side — `main` pads the page, the
 * column does not centre itself.
 *
 * A server component: a `div` is a `div`, and the operator surface ships no JavaScript of its own.
 */
export function OperatorFrame({ children }: { children: ReactNode }) {
  return <div className="w-full max-w-[1126px] p-4 sm:p-8">{children}</div>;
}
