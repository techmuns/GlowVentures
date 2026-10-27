let loading: Promise<typeof import('@/components/PdfPreview')> | undefined;

export const loadPdfPreview = () => loading ??= import('@/components/PdfPreview').catch(error => {
  loading = undefined;
  throw error;
});

/** Download and initialize the renderer on intent, before opening the dialog. */
export function preloadPdfPreview() {
  void loadPdfPreview().then(module => module.preparePdfPreview()).catch(() => {});
}
