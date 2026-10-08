export interface Passage {
  id: string;
  source: string;
  text: string;
}

// Hand-picked, whole-sentence passages from the public-domain books listed in
// sources.ts, normalized to typeable ASCII (curly quotes straightened, Gutenberg
// _italic_ marks removed, line breaks joined) and otherwise verbatim. Credits:
// the root NOTICE file.
export const PASSAGES: readonly Passage[] = [
  {
    id: "austen-pp-1",
    source: "austen-pp",
    text: "Occupied in observing Mr. Bingley's attention to her sister, Elizabeth was far from suspecting that she was herself becoming an object of some interest in the eyes of his friend. Mr. Darcy had at first scarcely allowed her to be pretty: he had looked at her without admiration at the ball; and when they next met, he looked at her only to criticise.",
  },
  {
    id: "austen-pp-2",
    source: "austen-pp",
    text: "Elizabeth, to whom Jane very soon communicated the chief of all this, heard it in silent indignation. Her heart was divided between concern for her sister and resentment against all others.",
  },
  {
    id: "austen-pp-3",
    source: "austen-pp",
    text: "The garden sloping to the road, the house standing in it, the green pales and the laurel hedge, everything declared they were arriving. Mr. Collins and Charlotte appeared at the door, and the carriage stopped at the small gate, which led by a short gravel walk to the house, amidst the nods and smiles of the whole party.",
  },
  {
    id: "austen-pp-4",
    source: "austen-pp",
    text: "In the afternoon Lydia was urgent with the rest of the girls to walk to Meryton, and see how everybody went on; but Elizabeth steadily opposed the scheme. It should not be said, that the Miss Bennets could not be at home half a day before they were in pursuit of the officers.",
  },
  {
    id: "austen-pp-5",
    source: "austen-pp",
    text: "Elizabeth was not comfortable; that was impossible; but she was flattered and pleased. His wish of introducing his sister to her was a compliment of the highest kind. They soon outstripped the others; and when they had reached the carriage, Mr. and Mrs. Gardiner were half a quarter of a mile behind.",
  },
  {
    id: "austen-pp-6",
    source: "austen-pp",
    text: "How could I ever be foolish enough to expect a renewal of his love? Is there one among the sex who would not protest against such a weakness as a second proposal to the same woman?",
  },
  {
    id: "austen-pp-7",
    source: "austen-pp",
    text: "Another entreaty that she would be serious, however, produced the desired effect; and she soon satisfied Jane by her solemn assurances of attachment. When convinced on that article, Miss Bennet had nothing further to wish.",
  },
  {
    id: "austen-emma-1",
    source: "austen-emma",
    text: "Neither would Mr. Knightley's downright, decided, commanding sort of manner, though it suits him very well; his figure, and look, and situation in life seem to allow it; but if any young man were to set about copying him, he would not be sufferable.",
  },
  {
    id: "austen-emma-2",
    source: "austen-emma",
    text: "The room they were taken into was the one he chiefly occupied, and looking forwards; behind it was another with which it immediately communicated; the door between them was open, and Emma passed into it with the housekeeper to receive her assistance in the most comfortable manner.",
  },
  {
    id: "austen-emma-3",
    source: "austen-emma",
    text: "The charm of an object to occupy the many vacancies of Harriet's mind was not to be talked away. He might be superseded by another; he certainly would indeed; nothing could be clearer; even a Robert Martin would have been sufficient; but nothing else, she feared, would cure her.",
  },
  {
    id: "austen-emma-4",
    source: "austen-emma",
    text: "Every body invited, was certainly to come; Frank had already written to Enscombe to propose staying a few days beyond his fortnight, which could not possibly be refused. And a delightful dance it was to be.",
  },
  {
    id: "austen-emma-5",
    source: "austen-emma",
    text: "Dinner-parties and evening-parties were made for him and his lady; and invitations flowed in so fast that she had soon the pleasure of apprehending they were never to have a disengaged day.",
  },
  {
    id: "austen-emma-6",
    source: "austen-emma",
    text: "Mr. Knightley had another reason for avoiding a table in the shade. He wished to persuade Mr. Woodhouse, as well as Emma, to join the party; and he knew that to have any of them sitting down out of doors to eat would inevitably make him ill.",
  },
  {
    id: "austen-emma-7",
    source: "austen-emma",
    text: "The difference of Harriet at Mrs. Goddard's, or in London, made perhaps an unreasonable difference in Emma's sensations; but she could not think of her in London without objects of curiosity and employment, which must be averting the past, and carrying her out of herself.",
  },
  {
    id: "melville-1",
    source: "melville",
    text: "I had not been seated very long ere a man of a certain venerable robustness entered; immediately as the storm-pelted door flew back upon admitting him, a quick regardful eyeing of him by all the congregation, sufficiently attested that this fine old man was the chaplain.",
  },
  {
    id: "melville-2",
    source: "melville",
    text: "I was already aware that in the whaling business they paid no wages; but all hands, including the captain, received certain shares of the profits called lays, and that these lays were proportioned to the degree of importance pertaining to the respective duties of the ship's company.",
  },
  {
    id: "melville-3",
    source: "melville",
    text: "Inward they turned upon the soul, especially when the still mild hours of eve came on; then, memory shot her crystals as the clear ice most forms of noiseless twilights. And all these subtle agencies, more and more they wrought on Ahab's texture.",
  },
  {
    id: "melville-4",
    source: "melville",
    text: "A short rushing sound leaped out of the boat; it was the darted iron of Queequeg. Then all in one welded commotion came an invisible push from astern, while forward the boat seemed striking on a ledge; the sail collapsed and exploded; a gush of scalding vapor shot up near by; something rolled and tumbled like an earthquake beneath us.",
  },
  {
    id: "melville-5",
    source: "melville",
    text: "Thus at the North have I chased Leviathan round and round the Pole with the revolutions of the bright points that first defined him to me. And beneath the effulgent Antarctic skies I have boarded the Argo-Navis, and joined the chase against the starry Cetus far beyond the utmost stretch of Hydrus and the Flying Fish.",
  },
  {
    id: "melville-6",
    source: "melville",
    text: "Where one of that sort go down, twenty Right Whales do. This difference in the species is no doubt imputable in no small degree to the greater quantity of bone in the Right Whale; his Venetian blinds alone sometimes weighing more than a ton; from this incumbrance the Sperm Whale is wholly free.",
  },
  {
    id: "melville-7",
    source: "melville",
    text: "In what rapt ether sails the world, of which the weariest will never weary? Where is the foundling's father hidden? Our souls are like those orphans whose unwedded mothers die in bearing them: the secret of our paternity lies in their grave, and we must there to learn it.",
  },
  {
    id: "carroll-1",
    source: "carroll",
    text: "Alice opened the door and found that it led into a small passage, not much larger than a rat-hole: she knelt down and looked along the passage into the loveliest garden you ever saw.",
  },
  {
    id: "carroll-2",
    source: "carroll",
    text: "Just then she heard something splashing about in the pool a little way off, and she swam nearer to make out what it was: at first she thought it must be a walrus or hippopotamus, but then she remembered how small she was now, and she soon made out that it was only a mouse that had slipped in like herself.",
  },
  {
    id: "carroll-3",
    source: "carroll",
    text: "The next thing was to eat the comfits: this caused some noise and confusion, as the large birds complained that they could not taste theirs, and the small ones choked and had to be patted on the back.",
  },
  {
    id: "carroll-4",
    source: "carroll",
    text: "Alice knew it was the Rabbit coming to look for her, and she trembled till she shook the house, quite forgetting that she was now about a thousand times as large as the Rabbit, and had no reason to be afraid of it.",
  },
  {
    id: "carroll-5",
    source: "carroll",
    text: "Alice remained looking thoughtfully at the mushroom for a minute, trying to make out which were the two sides of it; and as it was perfectly round, she found this a very difficult question.",
  },
  {
    id: "carroll-6",
    source: "carroll",
    text: "The door led right into a large kitchen, which was full of smoke from one end to the other: the Duchess was sitting on a three-legged stool in the middle, nursing a baby; the cook was leaning over the fire, stirring a large cauldron which seemed to be full of soup.",
  },
  {
    id: "carroll-7",
    source: "carroll",
    text: "When she got back to the Cheshire Cat, she was surprised to find quite a large crowd collected round it: there was a dispute going on between the executioner, the King, and the Queen, who were all talking at once, while all the rest were quite silent, and looked very uncomfortable.",
  },
  {
    id: "shelley-1",
    source: "shelley",
    text: "From Italy they visited Germany and France. I, their eldest child, was born at Naples, and as an infant accompanied them in their rambles. I remained for several years their only child.",
  },
  {
    id: "shelley-2",
    source: "shelley",
    text: "One of the phenomena which had peculiarly attracted my attention was the structure of the human frame, and, indeed, any animal endued with life. Whence, I often asked myself, did the principle of life proceed?",
  },
  {
    id: "shelley-3",
    source: "shelley",
    text: "I cannot pretend to describe what I then felt. I had before experienced sensations of horror, and I have endeavoured to bestow upon them adequate expressions, but words cannot convey an idea of the heart-sickening despair that I then endured.",
  },
  {
    id: "shelley-4",
    source: "shelley",
    text: "The air was cold, and the rain again began to descend; we entered the hut, the fiend with an air of exultation, I with a heavy heart and depressed spirits. But I consented to listen, and seating myself by the fire which my odious companion had lighted, he thus began his tale.",
  },
  {
    id: "shelley-5",
    source: "shelley",
    text: "No father had watched my infant days, no mother had blessed me with smiles and caresses; or if they had, all my past life was now a blot, a blind vacancy in which I distinguished nothing.",
  },
  {
    id: "shelley-6",
    source: "shelley",
    text: "The saintly soul of Elizabeth shone like a shrine-dedicated lamp in our peaceful home. Her sympathy was ours; her smile, her soft voice, the sweet glance of her celestial eyes, were ever there to bless and animate us.",
  },
  {
    id: "shelley-7",
    source: "shelley",
    text: "I know not; I lost sensation, and chains and darkness were the only objects that pressed upon me. Sometimes, indeed, I dreamt that I wandered in flowery meadows and pleasant vales with the friends of my youth, but I awoke and found myself in a dungeon.",
  },
  {
    id: "dickens-tale-1",
    source: "dickens-tale",
    text: "The wine-shop was a corner shop, better than most others in its appearance and degree, and the master of the wine-shop had stood outside it, in a yellow waistcoat and green breeches, looking on at the struggle for the lost wine.",
  },
  {
    id: "dickens-tale-2",
    source: "dickens-tale",
    text: "There were solitary patches of road on the way between Soho and Clerkenwell, and Mr. Lorry, mindful of foot-pads, always retained Jerry for this service: though it was usually performed a good two hours earlier.",
  },
  {
    id: "dickens-tale-3",
    source: "dickens-tale",
    text: "A second man got up and went out. Madame Defarge set wine before the mender of roads called Jacques, who doffed his blue cap to the company, and drank. In the breast of his blouse he carried some coarse dark bread; he ate of this between whiles, and sat munching and drinking near Madame Defarge's counter.",
  },
  {
    id: "dickens-tale-4",
    source: "dickens-tale",
    text: "Only his daughter had the power of charming this black brooding from his mind. She was the golden thread that united him to a Past beyond his misery, and to a Present beyond his misery: and the sound of her voice, the light of her face, the touch of her hand, had a strong beneficial influence with him almost always.",
  },
  {
    id: "dickens-tale-5",
    source: "dickens-tale",
    text: "You see how composed he has become, and you cannot be afraid to leave him with me now. Why should you be? If you will lock the door to secure us from interruption, I do not doubt that you will find him, when you come back, as quiet as you leave him.",
  },
  {
    id: "dickens-tale-6",
    source: "dickens-tale",
    text: "The two brothers crossed the road from a dark corner, and identified me with a single gesture. The Marquis took from his pocket the letter I had written, showed it me, burnt it in the light of a lantern that was held, and extinguished the ashes with his foot.",
  },
  {
    id: "dickens-tale-7",
    source: "dickens-tale",
    text: "The having originated a precaution which was already in course of execution, was a great relief to Miss Pross. The necessity of composing her appearance so that it should attract no special notice in the streets, was another relief.",
  },
  {
    id: "dickens-ge-1",
    source: "dickens-ge",
    text: "Our lights warmed the air about us with their pitchy blaze, and the two prisoners seemed rather to like that, as they limped along in the midst of the muskets. We could not go fast, because of their lameness; and they were so spent, that two or three times we had to halt while they rested.",
  },
  {
    id: "dickens-ge-2",
    source: "dickens-ge",
    text: "I sat silent, recalling what a drudge she had been until Mr. Wopsle's great-aunt successfully overcame that bad habit of living, so highly desirable to be got rid of by some people.",
  },
  {
    id: "dickens-ge-3",
    source: "dickens-ge",
    text: "We entered this haven through a wicket-gate, and were disgorged by an introductory passage into a melancholy little square that looked to me like a flat burying-ground. I thought it had the most dismal trees in it, and the most dismal sparrows, and the most dismal cats, and the most dismal houses (in number half a dozen or so), that I had ever seen.",
  },
  {
    id: "dickens-ge-4",
    source: "dickens-ge",
    text: "The candles that lighted that room of hers were placed in sconces on the wall. They were high from the ground, and they burnt with the steady dulness of artificial light in air that is seldom renewed.",
  },
  {
    id: "dickens-ge-5",
    source: "dickens-ge",
    text: "Miss Havisham was not in her own room, but was in the larger room across the landing. Looking in at the door, after knocking in vain, I saw her sitting on the hearth in a ragged chair, close before, and lost in the contemplation of, the ashy fire.",
  },
  {
    id: "dickens-ge-6",
    source: "dickens-ge",
    text: "In the same instant I heard responsive shouts, saw figures and a gleam of light dash in at the door, heard voices and tumult, and saw Orlick emerge from a struggle of men, as if it were tumbling water, clear the table at a leap, and fly out into the night.",
  },
  {
    id: "dickens-ge-7",
    source: "dickens-ge",
    text: "I opened my eyes in the night, and I saw, in the great chair at the bedside, Joe. I opened my eyes in the day, and, sitting on the window-seat, smoking his pipe in the shaded open window, still I saw Joe.",
  },
  {
    id: "thoreau-1",
    source: "thoreau",
    text: "I believe that all races at some seasons wear something equivalent to the shirt. It is desirable that a man be clad so simply that he can lay his hands on himself in the dark, and that he live in all respects so compactly and preparedly, that, if an enemy take the town, he can, like the old philosopher, walk out the gate empty-handed without anxiety.",
  },
  {
    id: "thoreau-2",
    source: "thoreau",
    text: "A lake like this is never smoother than at such a time; and the clear portion of the air above it being shallow and darkened by clouds, the water, full of light and reflections, becomes a lower heaven itself so much the more important.",
  },
  {
    id: "thoreau-3",
    source: "thoreau",
    text: "The whistle of the locomotive penetrates my woods summer and winter, sounding like the scream of a hawk sailing over some farmer's yard, informing me that many restless city merchants are arriving within the circle of the town, or adventurous country traders from the other side.",
  },
  {
    id: "thoreau-4",
    source: "thoreau",
    text: "A lake is the landscape's most beautiful and expressive feature. It is earth's eye; looking into which the beholder measures the depth of his own nature. The fluviatile trees next the shore are the slender eyelashes which fringe it, and the wooded hills and cliffs around are its overhanging brows.",
  },
  {
    id: "thoreau-5",
    source: "thoreau",
    text: "There is never an instant's truce between virtue and vice. Goodness is the only investment that never fails. In the music of the harp which trembles round the world it is the insisting on this which thrills us.",
  },
  {
    id: "thoreau-6",
    source: "thoreau",
    text: "I might visit in my old clothes a king and queen who lived simply in such a house as I have described, if I were going their way; but backing out of a modern palace will be all that I shall desire to learn, if ever I am caught in one.",
  },
  {
    id: "thoreau-7",
    source: "thoreau",
    text: "If you are chosen town-clerk, forsooth, you cannot go to Tierra del Fuego this summer: but you may go to the land of infernal fire nevertheless. The universe is wider than our views of it.",
  },
  {
    id: "twain-1",
    source: "twain",
    text: "I went down to the front garden and clumb over the stile where you go through the high board fence. There was an inch of new snow on the ground, and I seen somebody's tracks. They had come up from the quarry and stood around the stile a while, and then went on around the garden fence.",
  },
  {
    id: "twain-2",
    source: "twain",
    text: "I took the sack of corn meal and took it to where the canoe was hid, and shoved the vines and branches apart and put it in; then I done the same with the side of bacon; then the whisky-jug.",
  },
  {
    id: "twain-3",
    source: "twain",
    text: "I didn't know her face; she was a stranger, for you couldn't start a face in that town that I didn't know. Now this was lucky, because I was weakening; I was getting afraid I had come; people might know my voice and find me out.",
  },
  {
    id: "twain-4",
    source: "twain",
    text: "Often they do that and try to see how close they can come without touching; sometimes the wheel bites off a sweep, and then the pilot sticks his head out and laughs, and thinks he's mighty smart.",
  },
  {
    id: "twain-5",
    source: "twain",
    text: "I went to the circus and loafed around the back side till the watchman went by, and then dived in under the tent. I had my twenty-dollar gold piece and some other money, but I reckoned I better save it, because there ain't no telling how soon you are going to need it, away from home and amongst strangers that way.",
  },
  {
    id: "twain-6",
    source: "twain",
    text: "Towards the middle of the day the undertaker come with his man, and they set the coffin in the middle of the room on a couple of chairs, and then set all our chairs in rows, and borrowed more from the neighbors till the hall and the parlor and the dining-room was full.",
  },
  {
    id: "twain-7",
    source: "twain",
    text: "The family was at home. We didn't give it right up, but stayed with them as long as we could; because we allowed we'd tire them out or they'd got to tire us out, and they done it. Then we got allycumpain and rubbed on the places, and was pretty near all right again, but couldn't set down convenient.",
  },
  {
    id: "wilde-1",
    source: "wilde",
    text: "The post on her left was occupied by Mr. Erskine of Treadley, an old gentleman of considerable charm and culture, who had fallen, however, into bad habits of silence, having, as he explained once to Lady Agatha, said everything that he had to say before he was thirty.",
  },
  {
    id: "wilde-2",
    source: "wilde",
    text: "The senses could refine, and the intellect could degrade. Who could say where the fleshly impulse ceased, or the psychical impulse began? How shallow were the arbitrary definitions of ordinary psychologists!",
  },
  {
    id: "wilde-3",
    source: "wilde",
    text: "If it was not true, why trouble about it? But what if, by some fate or deadlier chance, eyes other than his spied behind and saw the horrible change? What should he do if Basil Hallward came and asked to look at his own picture?",
  },
  {
    id: "wilde-4",
    source: "wilde",
    text: "Was it not Gautier who used to write about la consolation des arts? I remember picking up a little vellum-covered book in your studio one day and chancing on that delightful phrase.",
  },
  {
    id: "wilde-5",
    source: "wilde",
    text: "The wan mirrors get back their mimic life. The flameless tapers stand where we had left them, and beside them lies the half-cut book that we had been studying, or the wired flower that we had worn at the ball, or the letter that we had been afraid to read, or that we had read too often.",
  },
  {
    id: "wilde-6",
    source: "wilde",
    text: "Dorian Gray frowned and turned his head away. He could not help liking the tall, graceful young man who was standing by him. His romantic, olive-coloured face and worn expression interested him.",
  },
  {
    id: "wilde-7",
    source: "wilde",
    text: "How lovely that thing you are playing is! I wonder, did Chopin write it at Majorca, with the sea weeping round the villa and the salt spray dashing against the panes? It is marvellously romantic.",
  },
  {
    id: "stevenson-ti-1",
    source: "stevenson-ti",
    text: "The whole schooner had been overhauled; six berths had been made astern out of what had been the after-part of the main hold; and this set of cabins was only joined to the galley and forecastle by a sparred passage on the port side.",
  },
  {
    id: "stevenson-ti-2",
    source: "stevenson-ti",
    text: "I saw, besides, many old sailors, with rings in their ears, and whiskers curled in ringlets, and tarry pigtails, and their swaggering, clumsy sea-walk; and if I had seen as many kings or archbishops I could not have been more delighted.",
  },
  {
    id: "stevenson-ti-3",
    source: "stevenson-ti",
    text: "The HISPANIOLA rolled steadily, dipping her bowsprit now and then with a whiff of spray. All was drawing alow and aloft; everyone was in the bravest spirits because we were now so near an end of the first part of our adventure.",
  },
  {
    id: "stevenson-ti-4",
    source: "stevenson-ti",
    text: "Crawling on all fours, I made steadily but slowly towards them, till at last, raising my head to an aperture among the leaves, I could see clear down into a little green dell beside the marsh, and closely set about with trees, where Long John Silver and another of the crew stood face to face in conversation.",
  },
  {
    id: "stevenson-ti-5",
    source: "stevenson-ti",
    text: "The cry he gave was echoed not only by his companions on board but by a great number of voices from the shore, and looking in that direction I saw the other pirates trooping out from among the trees and tumbling into their places in the boats.",
  },
  {
    id: "stevenson-ti-6",
    source: "stevenson-ti",
    text: "The other was, of course, my friend of the red night-cap. Both men were plainly the worse of drink, and they were still drinking, for even while I was listening, one of them, with a drunken cry, opened the stern window and threw out something, which I divined to be an empty bottle.",
  },
  {
    id: "stevenson-ti-7",
    source: "stevenson-ti",
    text: "Silver leant back against the wall, his arms crossed, his pipe in the corner of his mouth, as calm as though he had been in church; yet his eye kept wandering furtively, and he kept the tail of it on his unruly followers.",
  },
  {
    id: "stevenson-jh-1",
    source: "stevenson-jh",
    text: "The steps drew swiftly nearer, and swelled out suddenly louder as they turned the end of the street. The lawyer, looking forth from the entry, could soon see what manner of man he had to deal with.",
  },
  {
    id: "stevenson-jh-2",
    source: "stevenson-jh",
    text: "A closet was filled with wine; the plate was of silver, the napery elegant; a good picture hung upon the walls, a gift (as Utterson supposed) from Henry Jekyll, who was much of a connoisseur; and the carpets were of many piles and agreeable in colour.",
  },
  {
    id: "stevenson-jh-3",
    source: "stevenson-jh",
    text: "Written by the hand of Lanyon, what should it mean? A great curiosity came on the trustee, to disregard the prohibition and dive at once to the bottom of these mysteries; but professional honour and faith to his dead friend were stringent obligations; and the packet slept in the inmost corner of his private safe.",
  },
  {
    id: "stevenson-jh-4",
    source: "stevenson-jh",
    text: "If all is well, my shoulders are broad enough to bear the blame. Meanwhile, lest anything should really be amiss, or any malefactor seek to escape by the back, you and the boy must go round the corner with a pair of good sticks and take your post at the laboratory door.",
  },
  {
    id: "stevenson-jh-5",
    source: "stevenson-jh",
    text: "As you decide, you shall be left as you were before, and neither richer nor wiser, unless the sense of service rendered to a man in mortal distress may be counted as a kind of riches of the soul.",
  },
  {
    id: "stevenson-jh-6",
    source: "stevenson-jh",
    text: "The evil side of my nature, to which I had now transferred the stamping efficacy, was less robust and less developed than the good which I had just deposed. Again, in the course of my life, which had been, after all, nine tenths a life of effort, virtue and control, it had been much less exercised and much less exhausted.",
  },
  {
    id: "stevenson-jh-7",
    source: "stevenson-jh",
    text: "I was still so engaged when, in one of my more wakeful moments, my eyes fell upon my hand. Now the hand of Henry Jekyll (as you have often remarked) was professional in shape and size; it was large, firm, white and comely.",
  },
  {
    id: "bronte-1",
    source: "bronte",
    text: "Bessie, having pressed me in vain to take a few spoonfuls of the boiled milk and bread she had prepared for me, wrapped up some biscuits in a paper and put them into my bag; then she helped me on with my pelisse and bonnet, and wrapping herself in a shawl, she and I left the nursery.",
  },
  {
    id: "bronte-2",
    source: "bronte",
    text: "On the hill-top above me sat the rising moon; pale yet as a cloud, but brightening momentarily, she looked over Hay, which, half lost in trees, sent up a blue smoke from its few chimneys: it was yet a mile distant, but in the absolute hush I could hear plainly its thin murmurs of life.",
  },
  {
    id: "bronte-3",
    source: "bronte",
    text: "An hour or two sufficed to sketch my own portrait in crayons; and in less than a fortnight I had completed an ivory miniature of an imaginary Blanche Ingram. It looked a lovely face enough, and when compared with the real head in chalk, the contrast was as great as self-control could desire.",
  },
  {
    id: "bronte-4",
    source: "bronte",
    text: "You are cold, because you are alone: no contact strikes the fire from you that is in you. You are sick; because the best of feelings, the highest and the sweetest given to man, keeps far away from you.",
  },
  {
    id: "bronte-5",
    source: "bronte",
    text: "The dew fell, but with propitious softness; no breeze whispered. Nature seemed to me benign and good; I thought she loved me, outcast as I was; and I, who from man could anticipate only mistrust, rejection, insult, clung to her with filial fondness.",
  },
  {
    id: "bronte-6",
    source: "bronte",
    text: "One reason of the distance yet observed between us was, that he was comparatively seldom at home: a large proportion of his time appeared devoted to visiting the sick and poor among the scattered population of his parish.",
  },
  {
    id: "bronte-7",
    source: "bronte",
    text: "Summoning Mary, I soon had the room in more cheerful order: I prepared him, likewise, a comfortable repast. My spirits were excited, and with pleasure and ease I talked to him during supper, and for a long time after.",
  },
  {
    id: "stoker-1",
    source: "stoker",
    text: "Besides, I have nothing to tell you. There is really nothing to interest you. Town is very pleasant just now, and we go a good deal to picture-galleries and for walks and rides in the park.",
  },
  {
    id: "stoker-2",
    source: "stoker",
    text: "I went on to make a thorough examination of the various stairs and passages, and to try the doors that opened from them. One or two small rooms near the hall were open, but there was nothing to see in them except old furniture, dusty with age and moth-eaten.",
  },
  {
    id: "stoker-3",
    source: "stoker",
    text: "I have no doubt she guesses, if she does not know, what need of caution there is. We lunched alone, and as we all exerted ourselves to be cheerful, we got, as some kind of reward for our labours, some real cheerfulness amongst us.",
  },
  {
    id: "stoker-4",
    source: "stoker",
    text: "I thought I would watch for the Count's return, and for a long time sat doggedly at the window. Then I began to notice that there were some quaint little specks floating in the rays of the moonlight.",
  },
  {
    id: "stoker-5",
    source: "stoker",
    text: "Also the copy of letter to Carter Paterson, and their reply; of both of these I got copies. This was all the information Mr. Billington could give me, so I went down to the port and saw the coastguards, the Customs officers and the harbour-master.",
  },
  {
    id: "stoker-6",
    source: "stoker",
    text: "Lord Godalming smiled, and the man lifted a good-sized bunch of keys; selecting one of them, he began to probe the lock, as if feeling his way with it. After fumbling about for a bit he tried a second, and then a third.",
  },
  {
    id: "stoker-7",
    source: "stoker",
    text: "When we are married I shall be able to be useful to Jonathan, and if I can stenograph well enough I can take down what he wants to say in this way and write it out for him on the typewriter, at which also I am practising very hard.",
  },
  {
    id: "conrad-1",
    source: "conrad",
    text: "I had no difficulty in finding the Company's offices. It was the biggest thing in the town, and everybody I met was full of it. They were going to run an over-sea empire, and make no end of coin by trade.",
  },
  {
    id: "conrad-2",
    source: "conrad",
    text: "I wondered whether the stillness on the face of the immensity looking at us two were meant as an appeal or as a menace. What were we who had strayed in here? Could we handle that dumb thing, or would it handle us?",
  },
  {
    id: "conrad-3",
    source: "conrad",
    text: "About three in the morning some large fish leaped, and the loud splash made me jump as though a gun had been fired. When the sun rose there was a white fog, very warm and clammy, and more blinding than the night.",
  },
  {
    id: "conrad-4",
    source: "conrad",
    text: "Over the whole there was a light roof, supported on stanchions. The funnel projected through that roof, and in front of the funnel a small cabin built of light planks served for a pilot-house.",
  },
  {
    id: "conrad-5",
    source: "conrad",
    text: "Hadn't I been told in all the tones of jealousy and admiration that he had collected, bartered, swindled, or stolen more ivory than all the other agents together? That was not the point.",
  },
  {
    id: "conrad-6",
    source: "conrad",
    text: "The idleness of a passenger, my isolation amongst all these men with whom I had no point of contact, the oily and languid sea, the uniform sombreness of the coast, seemed to keep me away from the truth of things, within the toil of a mournful and senseless delusion.",
  },
  {
    id: "conrad-7",
    source: "conrad",
    text: "I don't defend myself. I had no clear perception of what it was I really wanted. Perhaps it was an impulse of unconscious loyalty, or the fulfilment of one of those ironic necessities that lurk in the facts of human existence.",
  },
  {
    id: "london-1",
    source: "london",
    text: "Considering that the price of dogs had been boomed skyward by the unwonted demand, it was not an unfair sum for so fine an animal. The Canadian Government would be no loser, nor would its despatches travel the slower.",
  },
  {
    id: "london-2",
    source: "london",
    text: "Always, they broke camp in the dark, and the first gray of dawn found them hitting the trail with fresh miles reeled off behind them. And always they pitched camp after dark, eating their bit of fish, and crawling to sleep into the snow.",
  },
  {
    id: "london-3",
    source: "london",
    text: "A dozen times, Perrault, nosing the way broke through the ice bridges, being saved by the long pole he carried, which he so held that it fell each time across the hole made by his body.",
  },
  {
    id: "london-4",
    source: "london",
    text: "No lazy, sun-kissed life was this, with nothing to do but loaf and be bored. Here was neither peace, nor rest, nor a moment's safety. All was confusion and action, and every moment life and limb were in peril.",
  },
  {
    id: "london-5",
    source: "london",
    text: "Day after day, for days unending, Buck toiled in the traces. Always, they broke camp in the dark, and the first gray of dawn found them hitting the trail with fresh miles reeled off behind them.",
  },
  {
    id: "london-6",
    source: "london",
    text: "John Thornton was whittling the last touches on an axe-handle he had made from a stick of birch. He whittled and listened, gave monosyllabic replies, and, when it was asked, terse advice.",
  },
  {
    id: "london-7",
    source: "london",
    text: "All passiveness and unconcern had dropped from them. They were alert and active, anxious that the work should go well, and fiercely irritable with whatever, by delay or confusion, retarded that work.",
  },
  {
    id: "eliot-1",
    source: "eliot",
    text: "To Rosamond it seemed as if she and Lydgate were as good as engaged. That they were some time to be engaged had long been an idea in her mind; and ideas, we know, tend to a more solid kind of existence, the necessary materials being at hand.",
  },
  {
    id: "eliot-2",
    source: "eliot",
    text: "Mary Garth had before this been getting ready to go home with her father. She met Fred in the hall, and now for the first time had the courage to look at him. He had that withered sort of paleness which will sometimes come on young faces, and his hand was very cold when she shook it.",
  },
  {
    id: "eliot-3",
    source: "eliot",
    text: "Dorothea sat almost motionless in her meditative struggle, while the evening slowly deepened into night. But the struggle changed continually, as that of a man who begins with a movement towards striking and ends with conquering his desire to strike.",
  },
  {
    id: "eliot-4",
    source: "eliot",
    text: "A strong leading in this direction seemed to have been given in the surprising facility of getting Stone Court, when every one had expected that Mr. Rigg Featherstone would have clung to it as the Garden of Eden.",
  },
  {
    id: "eliot-5",
    source: "eliot",
    text: "As he went along the passage to the drawing-room, he heard the piano and singing. Of course, Ladislaw was there. It was some weeks since Will had parted from Dorothea, yet he was still at the old post in Middlemarch.",
  },
  {
    id: "eliot-6",
    source: "eliot",
    text: "Even the more definite scandal concerning Bulstrode's earlier life was, for some minds, melted into the mass of mystery, as so much lively metal to be poured out in dialogue, and to take such fantastic shapes as heaven pleased.",
  },
  {
    id: "eliot-7",
    source: "eliot",
    text: "Hence Mr. Bulstrode's close attention was not agreeable to the publicans and sinners in Middlemarch; it was attributed by some to his being a Pharisee, and by others to his being Evangelical.",
  },
  {
    id: "alcott-1",
    source: "alcott",
    text: "Beth had her troubles as well as the others, and not being an angel but a very human little girl, she often 'wept a little weep' as Jo said, because she couldn't take music lessons and have a fine piano.",
  },
  {
    id: "alcott-2",
    source: "alcott",
    text: "Poor Meg had a restless night, and got up heavy-eyed, unhappy, half resentful toward her friends, and half ashamed of herself for not speaking out frankly and setting everything right.",
  },
  {
    id: "alcott-3",
    source: "alcott",
    text: "Amy did not come, Meg went to her room to try on a new dress, Jo was absorbed in her story, and Hannah was sound asleep before the kitchen fire, when Beth quietly put on her hood, filled her basket with odds and ends for the poor children, and went out into the chilly air with a heavy head and a grieved look in her patient eyes.",
  },
  {
    id: "alcott-4",
    source: "alcott",
    text: "A prouder young woman was seldom seen than she, when, having composed herself, she electrified the family by appearing before them with the letter in one hand, the check in the other, announcing that she had won the prize.",
  },
  {
    id: "alcott-5",
    source: "alcott",
    text: "I sent a line from Halifax, when I felt pretty miserable, but after that I got on delightfully, seldom ill, on deck all day, with plenty of pleasant people to amuse me. Everyone was very kind to me, especially the officers.",
  },
  {
    id: "alcott-6",
    source: "alcott",
    text: "Is Teddy studying so hard that he can't find time to write to his friends? Take good care of him for me, Beth, and tell me all about the babies, and give heaps of love to everyone.",
  },
  {
    id: "alcott-7",
    source: "alcott",
    text: "The equipages are as varied as the company and attract as much attention, especially the low basket barouches in which ladies drive themselves, with a pair of dashing ponies, gay nets to keep their voluminous flounces from overflowing the diminutive vehicles, and little grooms on the perch behind.",
  },
];
