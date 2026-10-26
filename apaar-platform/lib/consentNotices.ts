/**
 * The DPDP Act lets a person read the notice in English or any of the 22 languages in the Eighth Schedule.
 * Entries with `text: null` fall back to English and say so. The translations below are drafts: they need
 * certified legal translation before real use.
 */

export interface NoticeLanguage {
  code: string;
  name: string;
  native: string;
  rtl?: boolean;
  text: string | null;
}

export const NOTICE_ENGLISH =
  "Your data is used only for the purposes you approve. You can withdraw consent at any time, and withdrawing will not cost you any service.";

export const NOTICE_LANGUAGES: NoticeLanguage[] = [
  { code: "en", name: "English", native: "English", text: NOTICE_ENGLISH },
  { code: "as", name: "Assamese", native: "অসমীয়া", text: "আপুনি অনুমোদন কৰা উদ্দেশ্যৰ বাবেহে আপোনাৰ তথ্য ব্যৱহাৰ কৰা হ'ব। আপুনি যিকোনো সময়তে সন্মতি প্ৰত্যাহাৰ কৰিব পাৰে। সন্মতি প্ৰত্যাহাৰ কৰিলে আপুনি কোনো সেৱাৰ পৰা বঞ্চিত নহ'ব।" },
  { code: "bn", name: "Bengali", native: "বাংলা", text: "আপনার তথ্য কেবল সেই উদ্দেশ্যেই ব্যবহৃত হবে যা আপনি অনুমোদন করেছেন। আপনি যেকোনো সময় সম্মতি প্রত্যাহার করতে পারেন। সম্মতি প্রত্যাহার করলে আপনি কোনো পরিষেবা হারাবেন না।" },
  { code: "brx", name: "Bodo", native: "बर'", text: null },
  { code: "doi", name: "Dogri", native: "डोगरी", text: null },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", text: "તમારો ડેટા ફક્ત તમે મંજૂર કરેલા હેતુઓ માટે જ વાપરવામાં આવશે. તમે ગમે ત્યારે સંમતિ પાછી ખેંચી શકો છો. સંમતિ પાછી ખેંચવાથી તમને કોઈ સેવાથી વંચિત રાખવામાં આવશે નહીં." },
  { code: "hi", name: "Hindi", native: "हिन्दी", text: "आपका डेटा केवल उन्हीं उद्देश्यों के लिए उपयोग किया जाएगा जिन्हें आप स्वीकृत करते हैं। आप किसी भी समय सहमति वापस ले सकते हैं। सहमति वापस लेने से आपको किसी सेवा का नुकसान नहीं होगा।" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", text: "ನೀವು ಅನುಮೋದಿಸಿದ ಉದ್ದೇಶಗಳಿಗೆ ಮಾತ್ರ ನಿಮ್ಮ ಡೇಟಾವನ್ನು ಬಳಸಲಾಗುತ್ತದೆ. ನೀವು ಯಾವಾಗ ಬೇಕಾದರೂ ಸಮ್ಮತಿಯನ್ನು ಹಿಂಪಡೆಯಬಹುದು. ಸಮ್ಮತಿಯನ್ನು ಹಿಂಪಡೆದರೆ ನಿಮಗೆ ಯಾವುದೇ ಸೇವೆಯನ್ನು ನಿರಾಕರಿಸಲಾಗುವುದಿಲ್ಲ." },
  { code: "ks", name: "Kashmiri", native: "कॉशुर", text: null },
  { code: "kok", name: "Konkani", native: "कोंकणी", text: null },
  { code: "mai", name: "Maithili", native: "मैथिली", text: null },
  { code: "ml", name: "Malayalam", native: "മലയാളം", text: "നിങ്ങൾ അംഗീകരിച്ച ആവശ്യങ്ങൾക്ക് മാത്രമേ നിങ്ങളുടെ ഡാറ്റ ഉപയോഗിക്കൂ. എപ്പോൾ വേണമെങ്കിലും നിങ്ങൾക്ക് സമ്മതം പിൻവലിക്കാം. സമ്മതം പിൻവലിക്കുന്നതുകൊണ്ട് നിങ്ങൾക്ക് ഒരു സേവനവും നിഷേധിക്കപ്പെടില്ല." },
  { code: "mni", name: "Manipuri", native: "ꯃꯦꯇꯦꯏ", text: null },
  { code: "mr", name: "Marathi", native: "मराठी", text: "तुमचा डेटा फक्त तुम्ही मान्य केलेल्या उद्देशांसाठीच वापरला जाईल. तुम्ही कधीही संमती मागे घेऊ शकता. संमती मागे घेतल्याने तुम्हाला कोणतीही सेवा नाकारली जाणार नाही." },
  { code: "ne", name: "Nepali", native: "नेपाली", text: "तपाईंको डेटा तपाईंले स्वीकृत गरेका उद्देश्यहरूका लागि मात्र प्रयोग गरिनेछ। तपाईं जुनसुकै बेला सहमति फिर्ता लिन सक्नुहुन्छ। सहमति फिर्ता लिँदा तपाईंलाई कुनै सेवाबाट वञ्चित गरिने छैन।" },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ", text: "ଆପଣ ଅନୁମୋଦନ କରିଥିବା ଉଦ୍ଦେଶ୍ୟ ପାଇଁ ହିଁ ଆପଣଙ୍କ ତଥ୍ୟ ବ୍ୟବହୃତ ହେବ। ଆପଣ ଯେକୌଣସି ସମୟରେ ସମ୍ମତି ପ୍ରତ୍ୟାହାର କରିପାରିବେ। ସମ୍ମତି ପ୍ରତ୍ୟାହାର କଲେ ଆପଣଙ୍କୁ କୌଣସି ସେବା ମନା କରାଯିବ ନାହିଁ।" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", text: "ਤੁਹਾਡਾ ਡੇਟਾ ਸਿਰਫ਼ ਉਨ੍ਹਾਂ ਮੰਤਵਾਂ ਲਈ ਵਰਤਿਆ ਜਾਵੇਗਾ ਜੋ ਤੁਸੀਂ ਮਨਜ਼ੂਰ ਕਰਦੇ ਹੋ। ਤੁਸੀਂ ਕਿਸੇ ਵੀ ਸਮੇਂ ਸਹਿਮਤੀ ਵਾਪਸ ਲੈ ਸਕਦੇ ਹੋ। ਸਹਿਮਤੀ ਵਾਪਸ ਲੈਣ ਨਾਲ ਤੁਹਾਨੂੰ ਕਿਸੇ ਵੀ ਸੇਵਾ ਤੋਂ ਵਾਂਝਾ ਨਹੀਂ ਕੀਤਾ ਜਾਵੇਗਾ।" },
  { code: "sa", name: "Sanskrit", native: "संस्कृतम्", text: "भवता अनुमोदितेषु उद्देश्येषु एव भवतः दत्तांशः उपयुज्यते। भवान् कदापि सम्मतिं प्रत्याहर्तुं शक्नोति। सम्मतिप्रत्याहरणेन भवान् कस्याः अपि सेवायाः वञ्चितः न भविष्यति।" },
  { code: "sat", name: "Santali", native: "ᱥᱟᱱᱛᱟᱲᱤ", text: null },
  { code: "sd", name: "Sindhi", native: "سنڌي", rtl: true, text: null },
  { code: "ta", name: "Tamil", native: "தமிழ்", text: "நீங்கள் அனுமதித்த நோக்கங்களுக்காக மட்டுமே உங்கள் தரவு பயன்படுத்தப்படும். எந்த நேரத்திலும் உங்கள் ஒப்புதலைத் திரும்பப் பெறலாம். ஒப்புதலைத் திரும்பப் பெறுவதால் உங்களுக்கு எந்த சேவையும் மறுக்கப்படாது." },
  { code: "te", name: "Telugu", native: "తెలుగు", text: "మీరు అనుమతించిన ప్రయోజనాల కోసం మాత్రమే మీ డేటా ఉపయోగించబడుతుంది. మీరు ఎప్పుడైనా సమ్మతిని ఉపసంహరించుకోవచ్చు. సమ్మతిని ఉపసంహరించుకున్నందుకు మీకు ఏ సేవా నిరాకరించబడదు." },
  { code: "ur", name: "Urdu", native: "اردو", rtl: true, text: "آپ کا ڈیٹا صرف انہی مقاصد کے لیے استعمال ہوگا جن کی آپ منظوری دیتے ہیں۔ آپ کسی بھی وقت رضامندی واپس لے سکتے ہیں۔ رضامندی واپس لینے سے آپ کو کسی خدمت سے محروم نہیں کیا جائے گا۔" },
];
