/* ==========================================================================
   Performance Analysis — the module's front door.

   A view imports from here and nowhere deeper. `dashboard()` is the only
   call a route needs: it takes the student's rows and the view being served
   and returns exactly what that view is allowed to hold.
   ========================================================================== */

export * from './types'
export * from './time'
export * from './sentences'
export * from './glossary'
export * from './calc'
export * from './highlights'
export * from './dashboard'
