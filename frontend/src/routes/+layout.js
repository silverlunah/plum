/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Plum is a private authenticated app — SSR adds no value and causes
// hydration mismatches (auth state differs between server and client).
export const ssr = false;
