---
name: docs-sync
description: House style and editing rules for the HisobAI documentation set — which file owns what, how a DECISIONS entry is written, § numbering discipline, and where a new error code or term must land. Load before editing docs/.
---

You record decisions; you do not make them. If the parent did not state a
decision explicitly, ask — never infer it from the code.

Section line numbers for every document: see the `repo-map` skill. Grep the
heading, read a window, edit with a tight `old_string`. **Never read a
document whole**, never rewrite a file.

## Who owns what

| File              | Owns                                                           |
| ----------------- | -------------------------------------------------------------- |
| `DECISIONS.md`    | the decision log — **outranks every other document**           |
| `TZ.md`           | the requirement; staged delivery in §22                        |
| `ARCHITECTURE.md` | the technical design                                           |
| `API.md`          | cross-cutting API conventions; the error-code registry in §3.4 |
| `PERMISSIONS.md`  | the role matrix and access-control risks                       |
| `FRONTEND.md`     | frontend architecture                                          |
| `GLOSSARY.md`     | terminology                                                    |
| `files/design.md` | the design system                                              |

## House style

Uzbek, Latin script, terse. Tables where the original uses tables.
`§` cross-references between documents.

The defining habit of this document set: **every rule states its reason.**
A rule without a "why" will be undone by the next person who finds it
inconvenient. Match that — write the rule, then the sentence explaining what
breaks without it.

Dates are absolute (`2026-08-17`), never "bugun" or "keyingi hafta".

## `§` numbering discipline

**Never renumber an existing section.** Other documents, code comments and
commit messages cite them by number. Append; do not reflow. If a section must
be superseded, add a new one and note the supersession — do not silently edit
the meaning of an old number.

## A new stage-decision entry

Goes at the end of `DECISIONS.md` as a new numbered section matching the
existing pattern:

```
## NN. M-bosqich qarorlari (YYYY-MM-DD — mavzu)
```

Existing precedent: §18 (3-bosqich), §19 (4-bosqich), §20 (5-bosqich),
§21 (6-bosqich — platforma va tenant izolyatsiyasi), §22 (7-bosqich),
§23 (8-bosqich), §24 (9-bosqich). Read one of them before writing a new one.

## Where a change must land

| Change                           | Also update                                                  |
| -------------------------------- | ------------------------------------------------------------ |
| New error code                   | `API.md` §3.4 registry — not only the code                   |
| New term                         | `GLOSSARY.md`, under the right heading                       |
| New endpoint                     | `ARCHITECTURE.md` §8 route list                              |
| New/changed permission           | `PERMISSIONS.md` §2 matrix                                   |
| New shop-scoped table            | `ARCHITECTURE.md` §14.5 list                                 |
| A stage completed                | `TZ.md` §22 / `ARCHITECTURE.md` §13 status                   |
| A design token or component rule | `files/design.md`, and `FRONTEND.md` §8 if it affects wiring |

## Hard limits

- Never change a rule's meaning. You edit wording, add an entry, fix a
  reference. A change in meaning is the architect's call.
- Never invent a decision or a requirement.
- Never delete a section. Supersede it explicitly.
- If two documents disagree, do **not** pick a winner — report the
  contradiction and let `architecture-guardian` resolve it.
