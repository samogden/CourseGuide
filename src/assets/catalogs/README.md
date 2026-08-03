# Catalog YAML contract

Catalog data is organized by catalog year:

```text
catalogs/<year>/courses/<PREFIX>.yaml
catalogs/<year>/programs/<college>/<department>/<Degree>.yaml
catalogs/<year>/minors/<college>/<department>/<Minor>.yaml
```

Course files are the canonical definitions for course identity, credits,
offerings, prerequisites, and corequisites. Degree and minor files reference
courses by canonical IDs such as `CST-231`.

## Verified roadmap metadata

Each roadmap plan uses `schemaVersion: 1` and supplies its ordered `years` and
`terms`. A verified plan may also include advisory co-suggestion pairs:

```yaml
avoidCoSuggestedCoursePairs:
  - [MATH-130, CST-231]
```

This does **not** block either course or change prerequisite eligibility. If
both otherwise appear in the same recommendation batch, the later one is
shown as an optional stretch suggestion instead of a normal recommendation.

Prerequisites and corequisites remain the source of truth for whether a course
can be taken. A planned course does not satisfy a prerequisite until the
student marks it completed.
