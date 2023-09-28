/* eslint-disable max-lines */
import { UUID } from "crypto";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { useChatApi } from "@/lib/api/chat/useChatApi";
import { useCrawlApi } from "@/lib/api/crawl/useCrawlApi";
import { useNotificationApi } from "@/lib/api/notification/useNotificationApi";
import { useUploadApi } from "@/lib/api/upload/useUploadApi";
import { useChatContext } from "@/lib/context";
import { useBrainContext } from "@/lib/context/BrainProvider/hooks/useBrainContext";
import { useKnowledgeContext } from "@/lib/context/KnowledgeProvider/hooks/useKnowledgeContext";
import { getAxiosErrorParams } from "@/lib/helpers/getAxiosErrorParams";
import { useToast } from "@/lib/hooks";

import {
  FeedItemCrawlType,
  FeedItemUploadType,
} from "../../../../app/chat/[chatId]/components/ActionsBar/types";

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const useKnowledgeToFeedInput = () => {
  const { publish } = useToast();
  const { uploadFile } = useUploadApi();
  const { t } = useTranslation(["upload"]);
  const { crawlWebsiteUrl } = useCrawlApi();

  const crawlWebsiteHandler = useCallback(
    async (url: string, brainId: UUID, chat_id: UUID) => {
      // Configure parameters
      const config = {
        url: url,
        js: false,
        depth: 1,
        max_pages: 100,
        max_time: 60,
      };

      try {
        await crawlWebsiteUrl({
          brainId,
          config,
          chat_id,
        });
      } catch (error: unknown) {
        const errorParams = getAxiosErrorParams(error);
        if (errorParams !== undefined) {
          publish({
            variant: "danger",
            text: t("crawlFailed", {
              message: JSON.stringify(errorParams.message),
            }),
          });
        } else {
          publish({
            variant: "danger",
            text: t("crawlFailed", {
              message: JSON.stringify(error),
            }),
          });
        }
      }
    },
    [crawlWebsiteUrl, publish, t]
  );

  const uploadFileHandler = useCallback(
    async (file: File, brainId: UUID, chat_id: UUID) => {
      const formData = new FormData();
      formData.append("uploadFile", file);
      try {
        await uploadFile({
          brainId,
          formData,
          chat_id,
        });
      } catch (e: unknown) {
        const errorParams = getAxiosErrorParams(e);
        if (errorParams !== undefined) {
          publish({
            variant: "danger",
            text: t("uploadFailed", {
              message: JSON.stringify(errorParams.message),
            }),
          });
        } else {
          publish({
            variant: "danger",
            text: t("uploadFailed", {
              message: JSON.stringify(e),
            }),
          });
        }
      }
    },
    [publish, t, uploadFile]
  );

  return {
    crawlWebsiteHandler,
    uploadFileHandler,
  };
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const useFeedBrainInChat = ({
  dispatchHasPendingRequests,
  closeFeedInput,
}: {
  dispatchHasPendingRequests?: () => void;
  closeFeedInput?: () => void;
}) => {
  const { publish } = useToast();
  const { t } = useTranslation(["upload"]);
  const router = useRouter();

  const { currentBrainId } = useBrainContext();
  const { setKnowledgeToFeed, knowledgeToFeed } = useKnowledgeContext();
  const [hasPendingRequests, setHasPendingRequests] = useState(false);

  const { createChat } = useChatApi();
  const params = useParams();
  const chatId = params?.chatId as UUID | undefined;

  const { setNotifications } = useChatContext();
  const { getChatNotifications } = useNotificationApi();
  const fetchNotifications = async (currentChatId: UUID): Promise<void> => {
    const fetchedNotifications = await getChatNotifications(currentChatId);
    setNotifications(fetchedNotifications);
  };

  const { crawlWebsiteHandler, uploadFileHandler } = useKnowledgeToFeedInput();

  const files: File[] = (
    knowledgeToFeed.filter((c) => c.source === "upload") as FeedItemUploadType[]
  ).map((c) => c.file);

  const urls: string[] = (
    knowledgeToFeed.filter((c) => c.source === "crawl") as FeedItemCrawlType[]
  ).map((c) => c.url);

  const feedBrain = async (): Promise<void> => {
    if (currentBrainId === null) {
      publish({
        variant: "danger",
        text: t("selectBrainFirst"),
      });

      return;
    }

    if (knowledgeToFeed.length === 0) {
      publish({
        variant: "danger",
        text: t("addFiles"),
      });

      return;
    }

    try {
      dispatchHasPendingRequests?.();
      closeFeedInput?.();
      setHasPendingRequests(true);
      const currentChatId = chatId ?? (await createChat("New Chat")).chat_id;
      const uploadPromises = files.map((file) =>
        uploadFileHandler(file, currentBrainId, currentChatId)
      );
      const crawlPromises = urls.map((url) =>
        crawlWebsiteHandler(url, currentBrainId, currentChatId)
      );

      await Promise.all([...uploadPromises, ...crawlPromises]);

      setKnowledgeToFeed([]);

      if (chatId === undefined) {
        void router.push(`/chat/${currentChatId}`);
      } else {
        await fetchNotifications(currentChatId);
      }
    } catch (e) {
      publish({
        variant: "danger",
        text: JSON.stringify(e),
      });
    } finally {
      setHasPendingRequests(false);
    }
  };

  return {
    feedBrain,
    hasPendingRequests,
  };
};
