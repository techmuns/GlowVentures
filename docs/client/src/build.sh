cd /home/user/GlowVentures/docs/client
CH=$(ls /opt/pw-browsers/chromium-1194/chrome-linux/chrome 2>/dev/null || which chromium)
$CH --headless --no-sandbox --disable-gpu --no-pdf-header-footer --print-to-pdf=Glow-Ventures-reconciliation-update.pdf file://$PWD/src/report.html 2>&1 | tail -2
pdfinfo Glow-Ventures-reconciliation-update.pdf | grep Pages
