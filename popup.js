document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const modelNameInput = document.getElementById('modelName');
    const fileInput = document.getElementById('resumeFile');
    const processBtn = document.getElementById('processBtn');
    const statusDiv = document.getElementById('status');

    // Load saved settings
    chrome.storage.local.get(['geminiApiKey', 'geminiModel', 'relevantExpOnly'], (result) => {
        if (result.geminiApiKey) {
            apiKeyInput.value = result.geminiApiKey;
        }
        if (result.geminiModel) {
            modelNameInput.value = result.geminiModel;
        }
        if (result.relevantExpOnly) {
            document.getElementById('relevantExpOnly').checked = true;
        }
    });

    // Save settings on change
    const saveSettings = () => {
        chrome.storage.local.set({
            geminiApiKey: apiKeyInput.value,
            geminiModel: modelNameInput.value,
            relevantExpOnly: document.getElementById('relevantExpOnly').checked
        });
    };

    apiKeyInput.addEventListener('change', saveSettings);
    modelNameInput.addEventListener('change', saveSettings);
    document.getElementById('relevantExpOnly').addEventListener('change', saveSettings);

    processBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value;
        const model = modelNameInput.value;
        const file = fileInput.files[0];

        if (!apiKey) {
            updateStatus("Please enter your Gemini API Key.");
            return;
        }

        if (!file) {
            updateStatus("Please select a CV file.");
            return;
        }

        updateStatus("Reading file...");
        processBtn.disabled = true;

        try {
            const fileData = await readFileAsBase64(file);
            updateStatus(`Processing with ${model}...`);

            const extractedData = await callGeminiAPI(apiKey, model, fileData, file.type);

            updateStatus("Filling form...");

            // Send to content script
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab || (!tab.url.includes("employer.tigihr.com"))) {
                throw new Error("Please open the TIGI HR 'Add Resume' page first.");
            }

            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: 'MAIN',
                args: [extractedData],
                func: async (data) => {
                    const FIELD_IDS = {
                        full_name: '#full_name',
                        email: '#email',
                        mobile: '#mobile_1',
                        mobile_2: '#mobile_2',
                        current_company: '#current_company',
                        offer_inhand: '#offer_inhand',
                        admin_comment: '#admin_comment',
                        summary: '#summary',
                        bio: '#bio',
                        linkedIn_link: '#linkedIn_link',
                        portfolio_link: '#portfolio_link',
                        exp_year: '#exp_year',
                        exp_month: '#exp_month',
                        notice_period: '#notice_period',
                        cur_salary_lakh: '#cur_salary_lakh',
                        cur_salary_thousand: '#cur_salary_thousand',
                        exp_salary_lakh: '#exp_salary_lakh',
                        exp_salary_thousand: '#exp_salary_thousand',
                        gender: '#gender',
                        designation: '#designation',
                        skills: '#skills',
                        qualification: '#qualification',
                        pref_location: '#pref_location',
                        cur_location: '#cur_location',
                        industry: '#industry'
                    };

                    const SEARCH_ENDPOINTS = {
                        skills: '/admin/admins/select2_skill',
                        designation: '/admin/admins/select2_designation',
                        qualification: '/admin/admins/select2_qualification',
                        pref_location: '/admin/admins/select2_location',
                        cur_location: '/admin/admins/select2_location',
                        industry: '/admin/admins/select2_industry'
                    };

                    if (!window.jQuery) {
                        alert("jQuery not found on page. Please ensure you are on the TIGI HR portal.");
                        return;
                    }

                    const $ = window.jQuery;

                    const fetchSelect2Id = async (type, query) => {
                        const QUALIFICATIONS_MASTER = [
                            "BTM", "BJMC", "BSW", "B.F.Sc(Fisheries)", "B.P.Ed", "BHMS", "BAMS", "BFA", "B.FashionTech", "B.Design",
                            "MBBS", "LLB", "ICWA", "CS", "CA", "BVSc", "BSc", "BHM", "BEd", "BE/B.Tech", "BDS", "BCA", "BBA/BBM", "BA",
                            "B.Pharm", "B.Com", "B.Arch", "All Post Graduates (PG)", "MTM", "M.F.Sc(Fisheries)", "MPEd", "MVSc",
                            "PG Diploma", "MSW", "MSc", "MS", "MHM", "MEd", "ME/M.Tech", "MDS", "MD", "MCA", "MBA/PGDM", "MA",
                            "M.Pham", "M.Com", "M.Arch", "M Phil / Phd", "LLM", "All other Non-Graduates", "No Education/Schooling",
                            "Upto 9th Std", "10th Pass (SSC)", "12th Pass (HSE)", "Vocational Training", "Certificate Course (ITI)",
                            "Diploma", "MLW", "Chemical Supervisor", "B.Pharma", "Pharmacy", "B.TECH", "12th standard", "10th standard",
                            "B.tech computer science", "BE/B.Tech", "BE", "Bachelors of computer engineering", "Senior secondary", "B.E (EEE)", "B.Tech CSE", "B.Tech (Computer Science Engineering)",
                            "Masters in Computer Applications", "B.TECH(ECE)", "B.Tech in Computer Science", "M.C.A", "B.C.A", "M.Tech", "B.Tech Civil Engg", "Class 12", "Class 10", "12th", "10th",
                            "B.Sc. Computer technology", "B.E (Electronics and Communication)", "PGDM", "B.SC ( Computer science )",
                            "B.Tech [ECE]", "B.Tech (Mechanical)", "Intermediate", "B.Tech in Software Engineering", "Bachelor of Engineering",
                            "Computer Science", "HSC", "B.Tech in Information Science and Engineering", "B-Tech", "10+2", "PUC", "SSLC"
                        ];

                        const standardizeQualification = (raw) => {
                            if (!raw || type !== 'qualification') return raw;
                            const normalized = raw.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                            const mapping = {
                                'btech': 'BE/B.Tech', 'be': 'BE/B.Tech', 'bacheloroftechnology': 'BE/B.Tech', 'bachelorofengineering': 'BE/B.Tech',
                                'mtech': 'ME/M.Tech', 'me': 'ME/M.Tech', 'masteroftechnology': 'ME/M.Tech', 'masterofengineering': 'ME/M.Tech',
                                'mba': 'MBA/PGDM', 'pgdm': 'MBA/PGDM', 'bsc': 'BSc', 'msc': 'MSc', 'bca': 'BCA', 'mca': 'MCA',
                                'bcom': 'B.Com', 'mcom': 'M.Com', '12th': '12th Pass (HSE)', '10th': '10th Pass (SSC)',
                                'ssc': '10th Pass (SSC)', 'hsc': '12th Pass (HSE)', 'intermediate': '12th Pass (HSE)'
                            };
                            if (mapping[normalized]) return mapping[normalized];
                            const exact = QUALIFICATIONS_MASTER.find(q => q.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized);
                            return exact || raw;
                        };

                        const endpoint = SEARCH_ENDPOINTS[type];
                        if (!endpoint) return null;

                        const performFetch = async (q) => {
                            const url = `${endpoint}?term=${encodeURIComponent(q)}&_type=query&q=${encodeURIComponent(q)}`;
                            try {
                                const response = await fetch(url);
                                const results = await response.json();
                                return (results && results.length > 0) ? results : null;
                            } catch (e) {
                                console.error(`Error fetching ID for ${type}: ${q}`, e);
                                return null;
                            }
                        };

                        let cleanQuery = standardizeQualification(query.trim());

                        // 1. Location Sanitization
                        if (type === 'cur_location' || type === 'pref_location') {
                            cleanQuery = cleanQuery.replace(/,?\s*(India|Gujarat|Maharashtra|Karnataka|Tamil\s*Nadu|Delhi|State)\s*$/i, '').trim();
                        }

                        let results = await performFetch(cleanQuery);

                        // 2. Retry Logic for Qualification if no results
                        if (!results && type === 'qualification') {
                            // Try extracting the simplified degree (e.g., "MBA" from "MBA (Finance)")
                            const match = cleanQuery.match(/^([A-Za-z\.]+)/);
                            if (match && match[1] !== cleanQuery) {
                                results = await performFetch(match[1]);
                            }
                        }

                        if (results) {
                            // Try to find an exact case-insensitive match first
                            const exactMatch = results.find(r => r.text.trim().toLowerCase() === cleanQuery.toLowerCase());
                            return exactMatch ? exactMatch.id : results[0].id;
                        }

                        return null;
                    };

                    // 1. Simple Text Inputs
                    const simpleFields = [
                        'full_name', 'email', 'mobile', 'mobile_2',
                        'current_company', 'offer_inhand',
                        'admin_comment', 'summary', 'bio',
                        'linkedIn_link', 'portfolio_link'
                    ];

                    simpleFields.forEach(field => {
                        let value = data[field];
                        if (value !== null && value !== undefined) {
                            // Sanitization for mobile numbers
                            if (field === 'mobile' || field === 'mobile_2') {
                                const digitsOnly = value.toString().replace(/\D/g, '');
                                if (digitsOnly.length > 10) {
                                    value = digitsOnly.slice(-10); // Keep last 10 digits
                                } else {
                                    value = digitsOnly;
                                }
                            }

                            const $el = $(FIELD_IDS[field]);
                            if ($el.length) {
                                $el.val(value).trigger('input').trigger('change').trigger('keyup');
                            }
                        }
                    });

                    // 2. Simple Dropdowns
                    const dropdownFields = [
                        'exp_year', 'exp_month', 'cur_salary_lakh', 'cur_salary_thousand',
                        'exp_salary_lakh', 'exp_salary_thousand', 'gender'
                    ];

                    dropdownFields.forEach(field => {
                        if (data[field] !== null && data[field] !== undefined) {
                            const $el = $(FIELD_IDS[field]);
                            if ($el.length) {
                                $el.val(data[field]).trigger('change').trigger('change.select2');
                            }
                        }
                    });

                    // 3. Notice Period (Disabled by user request)
                    /*
                    if (data.notice_period) {
                        const noticeMap = {
                            'Immediate': '1', '7 Days': '2', '15 Days': '3', 
                            '30 Days': '4', '45 Days': '5', '60 Days': '6', '90 Days': '7'
                        };
                        const val = noticeMap[data.notice_period] || data.notice_period;
                        $(FIELD_IDS.notice_period).val(val).trigger('change');
                    }
                    */

                    // 4. Preferred Location Default
                    if (!data.pref_location || (Array.isArray(data.pref_location) && data.pref_location.length === 0)) {
                        data.pref_location = "Anywhere in India";
                    }

                    // 4. Select2 Handling (Async)
                    const handleSelect2 = async (idKey, values) => {
                        const $el = $(FIELD_IDS[idKey]);
                        if (!$el.length || !values) return;

                        const vArr = Array.isArray(values) ? values : [values];
                        const selectedIds = [];

                        for (const val of vArr) {
                            if (!val) continue;
                            const valStr = val.toString().trim();

                            // Check existing options
                            const currentOptions = $el.find('option');
                            let matched = currentOptions.filter(function () {
                                return $(this).text().trim().toLowerCase() === valStr.toLowerCase() || $(this).val() === valStr;
                            });

                            if (matched.length) {
                                selectedIds.push(matched.val());
                            } else {
                                // Fetch ID from server
                                const remoteId = await fetchSelect2Id(idKey, valStr);
                                if (remoteId) {
                                    if (!$el.find(`option[value="${remoteId}"]`).length) {
                                        $el.append(new Option(valStr, remoteId, true, true));
                                    }
                                    selectedIds.push(remoteId);
                                } else {
                                    // Fallback: use text if we can't find an ID (might fail on save)
                                    if (!$el.find(`option[value="${valStr}"]`).length) {
                                        $el.append(new Option(valStr, valStr, true, true));
                                    }
                                    selectedIds.push(valStr);
                                }
                            }
                        }
                        $el.val(selectedIds).trigger('change').trigger('change.select2');
                    };

                    // Fill Select2 fields sequentially to avoid race conditions
                    for (const k of ['designation', 'skills', 'qualification', 'pref_location', 'cur_location', 'industry']) {
                        await handleSelect2(k, data[k]);
                    }
                }
            }, (results) => {
                if (chrome.runtime.lastError) {
                    updateStatus("Error: " + chrome.runtime.lastError.message);
                } else {
                    updateStatus("Success! Form filled.");
                }
                processBtn.disabled = false;
            });


        } catch (error) {
            console.error(error);
            updateStatus("Error: " + error.message);
            processBtn.disabled = false;
        }
    });

    function updateStatus(msg) {
        statusDiv.textContent = msg;
    }

    function readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async function callGeminiAPI(apiKey, model, base64Data, mimeType) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const isRelevantExp = document.getElementById('relevantExpOnly').checked;
        const currentDate = new Date().toISOString().split('T')[0];

        const expInstruction = isRelevantExp
            ? `- exp_year: Calculate ONLY the relevant years of experience based on the candidate's primary/target Designation. If a role is marked "Present", calculate duration up to ${currentDate}. (number)\n            - exp_month: Remaining relevant months of experience. (number between 0 and 11. MUST default to 0 if exact years).`
            : `- exp_year: Total years of overall experience across all jobs combined. If a role is marked "Present", calculate duration up to ${currentDate}. (number)\n            - exp_month: Remaining overall months of experience. (number between 0 and 11. MUST default to 0 if exact years).`;

        const prompt = `
<system_instructions>
You are an expert technical recruiter with over 10 years of experience in high-growth companies. Your primary objective is to accurately parse the attached CV/Resume and extract structured data for a candidate management system.
</system_instructions>

<extraction_rules>
1. Phone Numbers: Extract the primary phone number for 'mobile'. Strip all country codes (e.g., +91, 0, or 91) and spaces. Return EXACTLY 10 digits. If a number starts with 91 and has 12 digits, remove the 91. Do the same for 'mobile_2'.
2. Designation: Extract ONLY the CURRENT or MOST RECENT job title. Do not list historical roles.
3. Experience: ${expInstruction}
4. Qualification: Map to standardized degree names. Examples: "BE/B.Tech", "MBA/PGDM", "BSc", "MSc", "B.Com", "12th Pass (HSE)", "10th Pass (SSC)". Extract ONLY the degree name.
5. Location: 
   - For 'cur_location': Provide ONLY THE CITY NAME (e.g., "Ahmedabad", "Mumbai"). If the current location is outside India, output EXACTLY "Out of India".
   - For 'pref_location': Extract the preferred city. If the preferred location is outside India, output EXACTLY "Out of India". If no preferred location is explicitly mentioned in the CV, strictly output "Anywhere in India".
   - DO NOT include state or country names for Indian cities.
6. Skills: Extract EVERY technical and soft skill explicitly mentioned. Return as an array of strings. Do not skip any.
7. Industry: Identify the most likely industry for this candidate (e.g., "Information Technology", "Banking", "Construction"). 
8. Bio Character Limit: Write a high-quality professional profile bio for the client to read. It MUST be exactly 1 to 2 short sentences (approx. 10 to 30 words) to ensure it stays between 50 and 200 characters.
9. Missing Data: If ANY data is missing from the CV or cannot be confidently inferred, use null (except for pref_location which has a specific fallback).
</extraction_rules>

<json_schema>
Return ONLY a valid JSON object matching this exact structure:
{
  "full_name": "string or null",
  "email": "string or null",
  "current_company": "string or null",
  "linkedIn_link": "Full URL string or null",
  "portfolio_link": "Full URL string or null",
  "mobile": "10-digit string or null",
  "mobile_2": "10-digit string or null",
  "skills": ["skill1", "skill2"],
  "designation": "Current/Most recent title string or null",
  "exp_year": "number or null",
  "exp_month": "number or null",
  "cur_salary_lakh": "number or null",
  "cur_salary_thousand": "number or null",
  "exp_salary_lakh": "number or null",
  "exp_salary_thousand": "number or null",
  "qualification": "Standardized degree string or null",
  "cur_location": "City name, 'Out of India', or null",
  "pref_location": "City name, 'Out of India', or 'Anywhere in India'",
  "industry": "Industry string or null",
  "gender": "'male', 'female', or null",
  "summary": "Internal summary string for recruiting team or null",
  "bio": "High-quality professional profile bio (10-30 words) or null"
}
</json_schema>

<final_instruction>
Based on the attached CV document, extract the data according to the <extraction_rules>.
Output NOTHING except the raw, strictly valid JSON object described in the <json_schema>. Do not include markdown formatting like \`\`\`json.
</final_instruction>
        `;



        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: mimeType, data: base64Data } }
                    ]
                }]
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "Gemini API Error");
        }

        const json = await response.json();
        const textResponse = json.candidates[0].content.parts[0].text;

        // Robust JSON extraction using Regex
        const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("Failed to parse JSON from response: " + textResponse);
        }
        return JSON.parse(jsonMatch[0]);
    }
});
