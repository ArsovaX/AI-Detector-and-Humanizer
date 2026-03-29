export function exportReport(results) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const margin = 20;
  let y = margin;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;

  const primary = [99, 102, 241];
  const dark = [26, 26, 46];
  const gray = [102, 102, 128];
  const light = [200, 200, 210];

  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...dark);
  doc.text('ArsavoX', margin, y + 8);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...gray);
  doc.text('AI Detection Report', margin, y + 16);

  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  doc.setFontSize(9);
  doc.text(date, pageWidth - margin, y + 8, { align: 'right' });

  y += 30;

  doc.setDrawColor(...primary);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 15;

  const score = Math.round(results.overallScore * 100);
  const confidence = Math.round(results.confidence * 100);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...dark);
  doc.text('Overall AI Probability', margin, y);
  y += 12;

  const scoreColor = results.overallScore > 0.7 ? [239, 68, 68] :
    results.overallScore > 0.4 ? [245, 158, 11] : [16, 185, 129];

  doc.setFillColor(...scoreColor);
  doc.roundedRect(margin, y, 50, 25, 4, 4, 'F');
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(`${score}%`, margin + 25, y + 17, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(...dark);
  const verdict = results.overallScore > 0.7 ? 'Likely AI-Generated' :
    results.overallScore > 0.4 ? 'Mixed / Uncertain' : 'Likely Human-Written';
  doc.text(verdict, margin + 58, y + 10);

  doc.setFontSize(9);
  doc.setTextColor(...gray);
  doc.text(`Confidence: ${confidence}%`, margin + 58, y + 18);

  y += 38;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...dark);
  doc.text('Text Statistics', margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...gray);

  const stats = results.stats;
  const statsText = [
    `Words: ${stats.words}`,
    `Sentences: ${stats.sentences}`,
    `Paragraphs: ${stats.paragraphs}`,
    `Avg Sentence Length: ${stats.avgSentenceLength} words`,
    `Vocabulary Size: ${stats.vocabularySize} unique words`
  ];

  for (const line of statsText) {
    doc.text(line, margin, y);
    y += 5.5;
  }

  y += 10;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...dark);
  doc.text('Detection Breakdown', margin, y);
  y += 10;

  doc.setFillColor(240, 240, 245);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...dark);
  doc.text('Analyzer', margin + 3, y + 5.5);
  doc.text('Score', margin + 60, y + 5.5);
  doc.text('Weight', margin + 90, y + 5.5);
  doc.text('Details', margin + 115, y + 5.5);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  for (const item of results.breakdown) {
    const itemScore = Math.round(item.score * 100);
    const scoreClr = item.score > 0.7 ? [239, 68, 68] :
      item.score > 0.4 ? [245, 158, 11] : [16, 185, 129];

    doc.setTextColor(...dark);
    doc.text(item.label, margin + 3, y + 4);

    doc.setTextColor(...scoreClr);
    doc.text(`${itemScore}%`, margin + 60, y + 4);

    doc.setTextColor(...gray);
    doc.text(`${Math.round(item.weight * 100)}%`, margin + 90, y + 4);

    const detail = item.detail.length > 40 ? item.detail.substring(0, 37) + '...' : item.detail;
    doc.text(detail, margin + 115, y + 4);

    doc.setDrawColor(...light);
    doc.setLineWidth(0.1);
    doc.line(margin, y + 7, pageWidth - margin, y + 7);

    y += 9;
  }

  y += 10;

  if (results.flaggedPhrases && results.flaggedPhrases.length > 0) {
    if (y > 240) { doc.addPage(); y = margin; }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...dark);
    doc.text('Flagged AI Phrases', margin, y);
    y += 8;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');

    const seen = new Set();
    for (const fp of results.flaggedPhrases) {
      const key = fp.original.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      if (y > 275) { doc.addPage(); y = margin; }

      doc.setTextColor(...scoreColor);
      doc.text(`• "${fp.original}"`, margin + 3, y);
      doc.setTextColor(...gray);
      doc.text(`(weight: ${Math.round(fp.weight * 100)}%)`, margin + 3 + doc.getTextWidth(`• "${fp.original}"  `), y);
      y += 5.5;
    }
  }

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...light);
    doc.text(
      `ArsavoX Report — Generated ${date} — Page ${i} of ${totalPages}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  doc.save(`arsavox-report-${new Date().toISOString().split('T')[0]}.pdf`);
}
