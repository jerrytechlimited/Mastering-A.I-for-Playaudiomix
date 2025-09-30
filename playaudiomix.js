<!-- REQUIRED IN YOUR HTML:
<script src="https://js.paystack.co/v1/inline.js"></script>
<script src="https://www.paypal.com/sdk/js?client-id=AZ_EW2Q9G-3VsiQYs8XaQsh0VUxPj_2cb2HBoSSUYie4PEmC2PLe1hfT-IcipBeRYygXwnnpOL00o6pY&currency=USD"></script>
-->

<script>
// --- Reference Tracks ---
const REFERENCE_TRACKS2 = {
  JAZZ: "https://res.cloudinary.com/dozclei2n/video/upload/v1757087501/n884ce4bb65d328ecb03c598409e2b168-79659fb3286c9ea31c4e6973da4f7f8e_r3tywn.mp3",
  AFROBEAT: "https://res.cloudinary.com/dozclei2n/video/upload/v1757219191/fast-rock-353534_gbhgxb.mp3",
  BLUES: "https://res.cloudinary.com/dozclei2n/video/upload/v1757082977/RetroFuture-Clean_chosic.com_p0kdyi.mp3",
  "GOSPEL WORSHIP": "https://res.cloudinary.com/dozclei2n/video/upload/v1757088423/Michael_W_Smith_-_Grace_CeeNaija.com__sgddlp.mp3",
  "GOSPEL PRAISE": "https://res.cloudinary.com/dozclei2n/video/upload/v1757087741/Frank_Edwards_-_Under_The_Canopy_CeeNaija.com__mmph2d.mp3",
  RAGGAE: "https://res.cloudinary.com/dozclei2n/video/upload/v1757218452/Patoranking_Celebrate_Me_9jaflaver.com__d6kghx.mp3",
  RNB: "https://res.cloudinary.com/dozclei2n/video/upload/v1757219016/smoke-143172_rognzf.mp3",
  HIGHLIFE: "https://res.cloudinary.com/dozclei2n/video/upload/v1757218457/Nathaniel_Bassey_-_TOBECHUKWU_Praise_God_Ft_Mercy_Chinwo_Blessed_CeeNaija.com__ilpuyo.mp3",
  RAP: "https://res.cloudinary.com/dozclei2n/video/upload/v1757087501/T-Pain-Can-t-Believe-It-feat.-Lil-Wayne_weoni7.mp3",
  EDM: "https://res.cloudinary.com/dozclei2n/video/upload/v1757219019/dance-for-me-280006_kpyw5y.mp3",
  TRAP: "https://res.cloudinary.com/dozclei2n/video/upload/v1757088559/Kendrick_Lamar_-_HUMBLE_Offblogmedia.com_kmjpsb.mp3",
  POP: "https://res.cloudinary.com/dozclei2n/video/upload/v1757218455/eona-emotional-ambient-pop-351436_akdt0c.mp3",
  "ROCK & ROLL": "https://res.cloudinary.com/dozclei2n/video/upload/v1757219191/fast-rock-353534_gbhgxb.mp3"
};

async function fetchReferenceAudio2(genre) {
  const url = REFERENCE_TRACKS2[genre];
  if (!url) throw new Erro
