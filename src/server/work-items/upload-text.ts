/** Format extraction only; business interpretation remains an explicit flow step. */
export async function extractUploadText(
  name: string,
  data: Buffer,
): Promise<{ text?: string; gap?: string }> {
  try {
    if (/\.(txt|md|json|csv|tsv|log|xml|yaml|yml)$/i.test(name))
      return { text: data.toString('utf8') };
    if (/\.pdf$/i.test(name)) {
      const { extractText } = await import('unpdf');
      const extracted = await extractText(new Uint8Array(data), {
        mergePages: true,
      });
      if (!extracted.text.trim())
        return { gap: 'PDF没有可提取正文，可能需要OCR；请补充文本。' };
      return { text: extracted.text };
    }
    if (/\.docx$/i.test(name)) {
      const mammoth = await import('mammoth');
      const extracted = await mammoth.extractRawText({ buffer: data });
      return extracted.value.trim()
        ? { text: extracted.value }
        : { gap: '文档没有可提取正文，请补充文本。' };
    }
    if (/\.xlsx?$/i.test(name)) {
      const xlsx = await import('xlsx');
      const book = xlsx.read(data, { type: 'buffer' });
      return {
        text: book.SheetNames.map(
          (name) =>
            `工作表：${name}\n${xlsx.utils.sheet_to_csv(book.Sheets[name])}`,
        ).join('\n\n'),
      };
    }
    return {
      gap: '此格式正文尚未解析，请提供文本/CSV/JSON，或明确运行文件解析方法。',
    };
  } catch (error) {
    return {
      gap: `文件正文解析失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
