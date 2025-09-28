// Вставити у DevTools Console на сторінці з розкладом
(function(){
  const ROOT_SELECTOR = '#Content > #Schedule';
  const TABLE_SELECTOR = '#ScheduleWeek';
  const DEFAULT_PAIR_TIMES = {
    "1":"08:00-09:20","2":"09:30-10:50","3":"11:10-12:30","4":"13:00-14:20",
    "5":"14:40-16:00","6":"16:10-17:30","7":"17:40-19:00"
  };
  const weekOrder = ['понеділок','вівторок','середа','четвер',"п'ятниця"];

  const root = document.querySelector(ROOT_SELECTOR);
  if(!root){ console.error('ROOT не знайдено:', ROOT_SELECTOR); return; }
  const table = root.querySelector(TABLE_SELECTOR) || root.querySelector('table');
  if(!table){ console.error('Таблиця не знайдено.'); return; }

  // --- Заголовки ---
  const thead = table.querySelector('thead');
  const thRow = thead ? thead.querySelector('tr') : null;
  const headCells = thRow ? Array.from(thRow.querySelectorAll('th')) : [];
  const dayCells = headCells.slice(1);
  const headerDays = [];
  const dayColInfo = [];
  dayCells.forEach(th => {
    const text = th.innerText.trim().replace(/\s+/g,' ');
    const colspan = parseInt(th.getAttribute('colspan')||'1', 10);
    dayColInfo.push({day:text,colspan});
    for(let i=0;i<colspan;i++) headerDays.push({day:text});
  });
  const dayStartIdx = [], daySpan = [];
  for(let i=0;i<headerDays.length;i++){
    if(i===0 || headerDays[i].day !== headerDays[i-1].day){
      let span = 1;
      for(let j=i+1;j<headerDays.length;j++){
        if(headerDays[j].day === headerDays[i].day) span++; else break;
      }
      for(let k=i;k<i+span;k++){ dayStartIdx[k]=i; daySpan[k]=span; }
    }
  }

  // --- Створюємо матрицю з mapping originMap ---
  const trs = Array.from(table.querySelectorAll('tbody tr'));
  const nRows = trs.length;
  const nCols = 1 + headerDays.length;
  const matrix = Array.from({length:nRows}, ()=> Array(nCols).fill(null));
  const originMap = new Map(); // element -> {r,c,rowspan,colspan}
  for(let r=0;r<nRows;r++){
    const cells = Array.from(trs[r].querySelectorAll('th,td'));
    let c = 0;
    for(const cell of cells){
      while(c < nCols && matrix[r][c] !== null) c++;
      if(c >= nCols) break;
      const rs = parseInt(cell.getAttribute('rowspan')||'1',10);
      const cs = parseInt(cell.getAttribute('colspan')||'1',10);
      if(!originMap.has(cell)) originMap.set(cell, {r,c,rowspan:rs,colspan:cs});
      for(let rr=0; rr<rs; rr++){
        for(let cc=0; cc<cs; cc++){
          const rrIdx = r+rr, ccIdx = c+cc;
          if(rrIdx < nRows && ccIdx < nCols) matrix[rrIdx][ccIdx] = cell;
        }
      }
      c += cs;
    }
  }

  // --- Lesson blocks (номер пари / період) тільки з origin у колонці 0 ---
  const lessonBlocks = [];
  originMap.forEach((pos, el) => {
    if(pos.c !== 0) return;
    const rs = pos.rowspan, r0 = pos.r;
    const text = el.innerText.trim().replace(/\s+/g,' ');
    const numMatch = text.match(/^(\d+)/);
    const lesson = numMatch ? numMatch[1] : '';
    const periodEl = el.querySelector('.LessonPeriod');
    let period = periodEl ? periodEl.innerText.trim().replace(/\s+/g,' ') : '';
    if(!period && lesson && DEFAULT_PAIR_TIMES[lesson]) period = DEFAULT_PAIR_TIMES[lesson];
    lessonBlocks.push({startRow: r0, rowspan: rs, lesson, period});
  });
  function lessonForRow(r){
    for(const lb of lessonBlocks) if(r >= lb.startRow && r < lb.startRow + lb.rowspan) return lb;
    return {lesson:'', period:''};
  }

  // --- Формуємо результати ---
  const results = [];
  const seen = new Set();
  const groupCode = (function(){ try{ return (new URL(location.href)).searchParams.get('s')||'' }catch(e){return ''}})();

  originMap.forEach((pos, cell) => {
    if(pos.c === 0) return;
    const r0 = pos.r, c0 = pos.c, rs = pos.rowspan, cs = pos.colspan;
    const lb = lessonForRow(r0);
    const startHeader = c0 - 1;
    const endHeader = startHeader + cs - 1;
    const covered = [];
    for(let hi = startHeader; hi<=endHeader; hi++) if(hi >=0 && hi < headerDays.length) covered.push(hi);

    // групуємо covered по dayStart
    const byDayStart = {};
    covered.forEach(hi => {
      const ds = dayStartIdx[hi] !== undefined ? dayStartIdx[hi] : hi;
      byDayStart[ds] = byDayStart[ds] || [];
      byDayStart[ds].push(hi);
    });

    Object.keys(byDayStart).forEach(dsKey => {
      const ds = parseInt(dsKey,10);
      const his = byDayStart[ds];
      const dayName = headerDays[ds].day;
      const dayFullSpan = daySpan[ds] || 1;
      // Визначаємо week:
      // Якщо клітинка охоплює стільки рядків, скільки rowspan у lessonBlock => 'all'
      // Інакше weekIndex = (pos.r - lb.startRow) + 1
      let week = '1';
      if(lb.rowspan && rs >= lb.rowspan) week = 'all';
      else {
        const idx = pos.r - lb.startRow;
        week = (idx === 0) ? '1' : (idx === 1 ? '2' : String(idx+1));
      }

      // визначаємо, чи покриває клітинка весь день
      const coversWholeDay = (Math.min(...his) <= ds) && (Math.max(...his) >= ds + dayFullSpan - 1);

      if(coversWholeDay){
        const subjEl = cell.querySelector('a');
        const subject = subjEl ? subjEl.innerText.trim().replace(/\s+/g,' ') : (cell.innerText.trim().split('\n')[0]||'').trim();
        const info = cell.querySelector('.Info');
        let type='', location='';
        if(info){
          const lines = info.innerText.trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
          if(lines.length>0) type = lines[0];
          if(lines.length>1) location = lines.slice(1).join(' | ');
        }
        const hasContent = subject || type || location;
        if(!hasContent) return;
        const key = [dayName, lb.lesson, 'all', subject, type, location, week].join('|');
        if(seen.has(key)) return;
        seen.add(key);
        results.push({
          group: groupCode,
          day: dayName,
          subgroup: 'all',
          lesson: lb.lesson||'',
          period: lb.period||'',
          week: week,
          subject, type, location
        });
      } else {
        his.forEach(hi => {
          const dayStartForHi = dayStartIdx[hi] !== undefined ? dayStartIdx[hi] : hi;
          const offset = hi - dayStartForHi;
          const subgroup = offset + 1;
          const subjEl = cell.querySelector('a');
          const subject = subjEl ? subjEl.innerText.trim().replace(/\s+/g,' ') : (cell.innerText.trim().split('\n')[0]||'').trim();
          const info = cell.querySelector('.Info');
          let type='', location='';
          if(info){
            const lines = info.innerText.trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
            if(lines.length>0) type = lines[0];
            if(lines.length>1) location = lines.slice(1).join(' | ');
          }
          const hasContent = subject || type || location;
          if(!hasContent) return;
          const key = [dayName, lb.lesson, subgroup, subject, type, location, week].join('|');
          if(seen.has(key)) return;
          seen.add(key);
          results.push({
            group: groupCode,
            day: dayName,
            subgroup,
            lesson: lb.lesson||'',
            period: lb.period||'',
            week: week,
            subject, type, location
          });
        });
      }
    });
  });

  // --- Підсумок: упорядкувати дні та підрахунок ---
  const byDay = {};
  weekOrder.forEach(d=>byDay[d]=[]);
  headerDays.forEach(h=>{ if(!byDay[h.day]) byDay[h.day]=[]; });
  results.forEach(r=>{ if(!byDay[r.day]) byDay[r.day]=[]; byDay[r.day].push(r); });
  const summary = {}; Object.keys(byDay).forEach(k=>summary[k]=byDay[k].length);

  // CSV (без lecturer і raw) з полем week
  const fields = ['group','day','week','subgroup','lesson','period','subject','type','location'];
  const escape = s => `"${String(s===undefined||s===null?'':s).replace(/"/g,'""')}"`;
  const csvLines = [fields.map(escape).join(',')];
  results.forEach(r => csvLines.push(fields.map(f => escape(r[f])).join(',')));
  const csv = csvLines.join('\n');

  try{ copy(csv); console.log('CSV скопійовано в буфер обміну. Вставте у файл і збережіть .csv'); }catch(e){ console.warn('Не вдалося скопіювати CSV'); }
  try{ copy(JSON.stringify(results, null, 2)); }catch(e){}

  console.log('Загалом записів:', results.length);
  console.log('Підсумок по днях:', summary);
  console.log('Перші 20 записів (з week):', results.slice(0,20));
  return { results, byDay, summary, csv };
})();
