"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type PageTitleContextValue = {
  pageTitle: ReactNode;
  setPageTitle: (title: ReactNode) => void;
};

const PageTitleContext = createContext<PageTitleContextValue | null>(null);

export function usePageTitleContext() {
  return useContext(PageTitleContext);
}

type PageTitleProviderProps = {
  children: ReactNode;
};

type PageTitlePublisherProps = {
  title: ReactNode;
};

type PageTitleProps = {
  title: ReactNode;
};

type ShellPageTitleProps = {
  className?: string;
  fallback: ReactNode;
};

export function PageTitleProvider({ children }: PageTitleProviderProps) {
  const [pageTitle, setPageTitle] = useState<ReactNode>(null);
  const value = useMemo(
    () => ({
      pageTitle,
      setPageTitle,
    }),
    [pageTitle],
  );

  return (
    <PageTitleContext.Provider value={value}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function PageTitlePublisher({ title }: PageTitlePublisherProps) {
  const context = usePageTitleContext();
  const setPageTitle = context?.setPageTitle;

  useEffect(() => {
    if (!setPageTitle) {
      return;
    }

    setPageTitle(title);

    return () => {
      setPageTitle(null);
    };
  }, [setPageTitle, title]);

  return null;
}

export function PageTitle({ title }: PageTitleProps) {
  const context = usePageTitleContext();

  if (context) {
    return <PageTitlePublisher title={title} />;
  }

  return <h1>{title}</h1>;
}

export function ShellPageTitle({ className, fallback }: ShellPageTitleProps) {
  const context = usePageTitleContext();

  return <h1 className={className}>{context?.pageTitle ?? fallback}</h1>;
}
