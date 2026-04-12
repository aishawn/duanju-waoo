-- NovelPromotionProject: 广告/TVC 模式字段（与 schema.prisma 对齐）
ALTER TABLE `novel_promotion_projects`
  ADD COLUMN `adBriefData` TEXT NULL,
  ADD COLUMN `adDurationSec` INTEGER NULL,
  ADD COLUMN `adType` VARCHAR(191) NULL;
