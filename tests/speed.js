const samples = [
'A little curiosity can take you a long way.',
'Good software makes difficult tasks feel simple. Clear feedback helps people understand what happened and what they can do next.',
'The meeting has been moved to Thursday at 10:30 a.m. Please review the attached agenda and bring your latest project updates.',
'When you translate a web page, keep the original text visible. Place each translated paragraph directly below its source so readers can compare them.',
'Our small team built the first prototype in two weeks. We tested it with twelve customers, collected their feedback, and improved the onboarding experience.',
'If the network connection is interrupted, do not silently send the same request again. Show the current status and let the user decide whether to retry.',
'Privacy is a practical design choice. Store the API key only on this device, send it only to the official service, and keep it out of application logs.',
'The library opens at nine in the morning and closes at six in the evening. Visitors can borrow up to five books for three weeks. Renewals are available online.',
'A cache can make repeated translations much faster, but cached responses should be excluded from a fair speed comparison. Use the same source text and target language for each mode.',
'This report compares ten completed requests from each translation method. It records the time to the first visible text, the total completion time, and any failed requests. API costs are calculated from the actual input and output token counts.'
];
samples.forEach((text, i) => {
  const section=document.createElement('section'), button=document.createElement('button'), p=document.createElement('p');
  p.textContent=text; p.id=`sample-${i+1}`; button.textContent=`选择第 ${i+1} 段`; button.onclick=()=>{const range=document.createRange();range.selectNodeContents(p);const s=getSelection();s.removeAllRanges();s.addRange(range);}; section.append(button,p);document.getElementById('samples').append(section);
});
