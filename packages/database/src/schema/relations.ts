import { relations } from 'drizzle-orm';
import { adminRoles, admins, rolePermissions, roles, permissions } from './auth';
import {
  academicYears,
  classes,
  classSubjects,
  curricula,
  resourceTypes,
  schoolLevels,
  subjects,
  subtopics,
  tags,
  terms,
  topics,
} from './taxonomy';
import {
  collectionResources,
  collections,
  mediaAssets,
  resourceFiles,
  resourceTags,
  resourceVersions,
  resources,
} from './resources';

export const adminsRelations = relations(admins, ({ many }) => ({ roles: many(adminRoles) }));
export const adminRolesRelations = relations(adminRoles, ({ one }) => ({
  admin: one(admins, { fields: [adminRoles.adminId], references: [admins.id] }),
  role: one(roles, { fields: [adminRoles.roleId], references: [roles.id] }),
}));
export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(rolePermissions),
  admins: many(adminRoles),
}));
export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const schoolLevelsRelations = relations(schoolLevels, ({ many }) => ({
  classes: many(classes),
}));
export const classesRelations = relations(classes, ({ one, many }) => ({
  level: one(schoolLevels, { fields: [classes.levelId], references: [schoolLevels.id] }),
  subjects: many(classSubjects),
}));
export const subjectsRelations = relations(subjects, ({ many }) => ({
  classes: many(classSubjects),
  topics: many(topics),
}));
export const classSubjectsRelations = relations(classSubjects, ({ one }) => ({
  class: one(classes, { fields: [classSubjects.classId], references: [classes.id] }),
  subject: one(subjects, { fields: [classSubjects.subjectId], references: [subjects.id] }),
}));
export const topicsRelations = relations(topics, ({ one, many }) => ({
  subject: one(subjects, { fields: [topics.subjectId], references: [subjects.id] }),
  class: one(classes, { fields: [topics.classId], references: [classes.id] }),
  subtopics: many(subtopics),
}));
export const subtopicsRelations = relations(subtopics, ({ one }) => ({
  topic: one(topics, { fields: [subtopics.topicId], references: [topics.id] }),
}));

export const resourcesRelations = relations(resources, ({ one, many }) => ({
  class: one(classes, { fields: [resources.classId], references: [classes.id] }),
  subject: one(subjects, { fields: [resources.subjectId], references: [subjects.id] }),
  resourceType: one(resourceTypes, {
    fields: [resources.resourceTypeId],
    references: [resourceTypes.id],
  }),
  academicYear: one(academicYears, {
    fields: [resources.academicYearId],
    references: [academicYears.id],
  }),
  term: one(terms, { fields: [resources.termId], references: [terms.id] }),
  topic: one(topics, { fields: [resources.topicId], references: [topics.id] }),
  subtopic: one(subtopics, { fields: [resources.subtopicId], references: [subtopics.id] }),
  curriculum: one(curricula, { fields: [resources.curriculumId], references: [curricula.id] }),
  file: one(resourceFiles, { fields: [resources.fileId], references: [resourceFiles.id] }),
  thumbnail: one(mediaAssets, { fields: [resources.thumbnailId], references: [mediaAssets.id] }),
  tags: many(resourceTags),
  versions: many(resourceVersions),
}));
export const resourceTagsRelations = relations(resourceTags, ({ one }) => ({
  resource: one(resources, { fields: [resourceTags.resourceId], references: [resources.id] }),
  tag: one(tags, { fields: [resourceTags.tagId], references: [tags.id] }),
}));
export const resourceVersionsRelations = relations(resourceVersions, ({ one }) => ({
  resource: one(resources, { fields: [resourceVersions.resourceId], references: [resources.id] }),
  file: one(resourceFiles, { fields: [resourceVersions.fileId], references: [resourceFiles.id] }),
}));
export const collectionsRelations = relations(collections, ({ many }) => ({
  resources: many(collectionResources),
}));
export const collectionResourcesRelations = relations(collectionResources, ({ one }) => ({
  collection: one(collections, {
    fields: [collectionResources.collectionId],
    references: [collections.id],
  }),
  resource: one(resources, {
    fields: [collectionResources.resourceId],
    references: [resources.id],
  }),
}));
