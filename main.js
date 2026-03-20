import './style.css'
import * as THREE from 'three'
import { 
    EffectComposer, 
    RenderPass, 
    EffectPass, 
    BloomEffect, 
    ChromaticAberrationEffect
} from 'postprocessing'

// --- Utility: Sound Engine ---
class SoundEngine {
  constructor() {
    this.ctx = null
    this.enabled = false
  }
  init() {
    if (this.ctx) return
    this.ctx = new (window.AudioContext || window.webkitAudioContext)()
    this.enabled = true
  }
  resume() {
    this.init()
    if (this.ctx.state === 'suspended') this.ctx.resume()
  }
  playShatter() {
    if (!this.enabled || !this.ctx) return
    const bufferSize = this.ctx.sampleRate * 0.2
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
    const noise = this.ctx.createBufferSource()
    noise.buffer = buffer
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2)
    noise.connect(gain)
    gain.connect(this.ctx.destination)
    noise.start()
  }
  playRumble() {
    if (!this.enabled || !this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(60, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + 0.5)
    gain.gain.setValueAtTime(0.5, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.5)
  }
}
const sounds = new SoundEngine()

// --- World Engine ---
class World {
    constructor(container) {
        this.container = container
        this.scene = new THREE.Scene()
        this.scene.background = new THREE.Color(0x010205)
        this.scene.fog = new THREE.FogExp2(0x010205, 0.04)
        
        this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000)
        this.camera.position.set(0, 2.0, 12)
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" })
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping
        this.renderer.outputColorSpace = THREE.SRGBColorSpace
        this.container.appendChild(this.renderer.domElement)

        // Post-processing
        this.composer = new EffectComposer(this.renderer)
        this.composer.addPass(new RenderPass(this.scene, this.camera))
        
        this.bloomEffect = new BloomEffect({ intensity: 2.5, luminanceThreshold: 0.1, luminanceSmoothing: 0.9 })
        this.chromaticAberrationEffect = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0) })
        this.composer.addPass(new EffectPass(this.camera, this.bloomEffect, this.chromaticAberrationEffect))

        // Lights
        this.sparkleLights = []
        for(let i=0; i<6; i++) {
            const l = new THREE.PointLight(0xffffff, 5, 10)
            this.scene.add(l)
            this.sparkleLights.push(l)
        }
        
        this.rotation = new THREE.Euler(0, 0, 0, 'YXZ')
        this.targetRotation = new THREE.Euler(0, 0, 0, 'YXZ')
        this.shakeTime = 0
        this.shakeIntensity = 0
        this.isFading = true
        this.startTime = Date.now()

        window.addEventListener('resize', () => this.onResize())
    }

    setupControls() {
        // Camera movement disabled as per user request
    }

    setupEnvironment() {
        // High-end starfield
        const starGeo = new THREE.BufferGeometry()
        const starPos = []
        for(let i=0; i<8000; i++) starPos.push((Math.random()-0.5)*400, (Math.random()-0.5)*400, (Math.random()-0.5)*400)
        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3))
        const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.1, transparent: true, opacity: 0.8, color: 0xffffff }))
        this.scene.add(stars)

        const grid = new THREE.GridHelper(300, 100, 0x0a1525, 0x050a14)
        grid.position.y = -6
        grid.material.transparent = true
        grid.material.opacity = 0.4
        this.scene.add(grid)
    }

    shake(intensity = 0.5) { 
        this.shakeIntensity = intensity
        this.shakeTime = 0.5
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.composer.setSize(window.innerWidth, window.innerHeight)
    }

    render() {
        // Essential: Lock camera to fixed position every frame, then add shake
        this.camera.position.set(0, 2.0, 12)
        this.camera.quaternion.setFromEuler(this.rotation)

        if (this.shakeTime > 0) {
            this.shakeTime -= 0.016
            this.camera.position.x += (Math.random()-0.5) * this.shakeIntensity
            this.camera.position.y += (Math.random()-0.5) * this.shakeIntensity
        }

        // Fade
        const fadeEl = document.getElementById('fade')
        if (fadeEl && this.isFading) {
            const elapsed = Date.now() - this.startTime
            fadeEl.style.opacity = Math.max(0, 1 - (elapsed / 1500))
            if (elapsed > 1500) this.isFading = false
        }

        // Recovery
        if(this.chromaticAberrationEffect.offset.length() > 0.005) this.chromaticAberrationEffect.offset.multiplyScalar(0.9)
        else this.chromaticAberrationEffect.offset.set(0,0)

        // Sparkle Move
        const time = Date.now() * 0.001
        this.sparkleLights.forEach((l, i) => {
            l.position.x = Math.cos(time + i * 1.5) * 5
            l.position.y = 2 + Math.sin(time * 0.8 + i) * 3
            l.position.z = Math.sin(time + i * 1.5) * 5
            l.intensity = 5 + Math.sin(time * 2 + i) * 3
        })

        this.composer.render()
        const fps = document.getElementById('fps')
        if(fps) fps.textContent = "SUPER CINEMATIC ENGINE"
    }
}

// --- Zen Objects AAA+ ---
class ZenObject {
    constructor(world) {
        this.world = world
        this.group = new THREE.Group()
        this.particles = []
        this.isShattered = false
        this.baseY = 2.0
        this.init()
    }
    init() {
        this.isShattered = false
        if (this.meshGroup) this.group.remove(this.meshGroup)
        this.meshGroup = new THREE.Group()
        this.build()
        this.group.add(this.meshGroup)
        this.meshGroup.position.set(0, this.baseY, 0)
        this.world.scene.add(this.group)
    }
    build() {}
    onClick(x, y) {
        if (this.isShattered) return
        const mouse = new THREE.Vector2((x/window.innerWidth)*2-1, -(y/window.innerHeight)*2+1)
        const raycaster = new THREE.Raycaster()
        raycaster.setFromCamera(mouse, this.world.camera)
        const hit = raycaster.intersectObjects(this.meshGroup.children, true)
        if (hit.length > 0) this.shatter(hit[0].point)
    }
    shatter(pos) {
        this.isShattered = true
        this.meshGroup.visible = false
        sounds.playShatter()
        sounds.playRumble()
        this.world.shake(0.7)
        
        this.world.bloomEffect.intensity = 25
        this.world.chromaticAberrationEffect.offset.set(0.06, 0)
        setTimeout(() => this.world.bloomEffect.intensity = 2.5, 250)

        const count = 160
        const palette = this.getFragmentPalette()
        
        for (let i = 0; i < count; i++) {
            const color = palette[Math.floor(Math.random() * palette.length)]
            const size = 0.05 + Math.random() * 0.45
            
            // AAA+ Fragment Material (Glass/Crystal)
            const fragMat = new THREE.MeshPhysicalMaterial({
                color,
                emissive: color,
                emissiveIntensity: color === 0xffffff ? 0.5 : 3, // Glass is less emissive
                transmission: color === 0xffffff ? 0.9 : 0.4,   // Glass is clearer
                thickness: 0.5,
                metalness: 0.1,
                roughness: 0,
                transparent: true,
                opacity: 1.0,
                iridescence: 0.5
            })

            const p = new THREE.Mesh(this.getFragmentGeo(size), fragMat)
            p.position.copy(pos).add(new THREE.Vector3((Math.random()-0.5)*1.2, (Math.random()-0.5)*1.2, (Math.random()-0.5)*1.2))
            
            // Randomized explosive velocity
            const vel = p.position.clone().sub(pos).normalize().multiplyScalar(0.4 + Math.random()*0.7)
            vel.y += 0.4 // Pop up
            
            p.userData = { 
                vel: vel, 
                rot: new THREE.Vector3(Math.random()*0.2, Math.random()*0.2, Math.random()*0.2),
                life: 1.0,
                stayHome: 2.5 // Longer stay
            }
            this.group.add(p)
            this.particles.push(p)
        }
        setTimeout(() => this.reset(), 800)
    }
    reset() {
        this.init()
        this.meshGroup.scale.set(0,0,0)
        let s = 0;
        const grow = () => { if(s < 1.0){ s+=0.06; this.meshGroup.scale.set(s,s,s); requestAnimationFrame(grow); } }
        grow()
    }
    update() {
        if (!this.isShattered) {
            this.meshGroup.rotation.y += 0.015
            this.meshGroup.rotation.z += 0.008
            this.meshGroup.position.y = this.baseY + Math.sin(Date.now()*0.0015)*0.5
            this.animate()
        }
        
        for (let i = this.particles.length-1; i>=0; i--) {
            const p = this.particles[i]
            const ud = p.userData
            
            // Physics
            p.position.add(ud.vel)
            p.rotation.x += ud.rot.x
            p.rotation.y += ud.rot.y
            
            ud.vel.y -= 0.018 // Gravity
            
            // Collision with Ground (y = -5.8)
            if (p.position.y < -5.8) {
                p.position.y = -5.8
                ud.vel.y *= -0.25 // Bounce
                ud.vel.x *= 0.82 // Friction
                ud.vel.z *= 0.82 // Friction
                ud.rot.multiplyScalar(0.7) // Spinning down
            }

            // Persistence & Fading
            if(ud.stayHome > 0) {
                ud.stayHome -= 0.016
            } else {
                ud.life -= 0.012
                p.material.opacity = ud.life
                if(ud.life <= 0) { 
                    this.group.remove(p)
                    p.geometry.dispose()
                    p.material.dispose()
                    this.particles.splice(i,1)
                }
            }
        }
    }
    animate() {}
    getFragmentPalette() { return [0xffffff] }
    getFragmentGeo(s) { return new THREE.BoxGeometry(s,s,s) }
}

// ⚙️ Hyper-Reflective Tech Cube
class TechObject extends ZenObject {
    build() {
        // High visibility glass
        const glassGeo = new THREE.BoxGeometry(2.5, 2.5, 2.5)
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            transmission: 0.4, // Lower for better visibility
            thickness: 1.5,
            ior: 1.6,
            roughness: 0,
            metalness: 0.1,
            iridescence: 1.0,
            iridescenceIOR: 1.5,
            transparent: true,
            opacity: 0.7
        })
        const glass = new THREE.Mesh(glassGeo, glassMat)
        this.meshGroup.add(glass)

        // Super Bright Glitch Core
        const coreGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6)
        const coreMat = new THREE.MeshStandardMaterial({ 
            color: 0xff0066, 
            emissive: 0xff0066, 
            emissiveIntensity: 10,
            metalness: 1,
            roughness: 0.2
        })
        this.core = new THREE.Mesh(coreGeo, coreMat)
        this.meshGroup.add(this.core)
        
        // Neon Frames
        const edges = new THREE.EdgesGeometry(glassGeo)
        const frames = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.8 }))
        this.meshGroup.add(frames)
    }
    animate() {
        this.core.rotation.x += 0.04
        this.core.rotation.y += 0.02
        this.core.scale.setScalar(1 + Math.sin(Date.now()*0.01)*0.15)
        if(Math.random() > 0.97) {
            this.world.chromaticAberrationEffect.offset.set(0.02*(Math.random()-0.5), 0)
            this.core.material.emissiveIntensity = 20
        } else {
            this.core.material.emissiveIntensity = 10
        }
    }
    getFragmentPalette() { return [0xffffff, 0xff0066, 0x00f2ff] } // Glass, Pink core, Neon frame
}

// 💎 Giant Iridescent Crystal (Pentagonal Upgrade)
class CrystalObject extends ZenObject {
    build() {
        this.meshGroup.scale.setScalar(1.2) // Increased base scale
        
        const mat = new THREE.MeshPhysicalMaterial({
            color: 0xff00cc,
            emissive: 0xffaa00,
            emissiveIntensity: 1.0,
            metalness: 0.1,
            roughness: 0,
            transmission: 0.5,
            thickness: 2.5,
            iridescence: 1.0,
            iridescenceIOR: 1.8,
            iridescenceThicknessRange: [100, 400]
        })
        
        // Pentagonal Shape (5 faces) - Wider and more solid
        const radius = 1.4 // Wider than before
        const height = 2.8 // Slightly shorter relative to width
        const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 5), mat)
        const top = new THREE.Mesh(new THREE.ConeGeometry(radius, 1.2, 5), mat)
        const bottom = new THREE.Mesh(new THREE.ConeGeometry(radius, 1.2, 5), mat)
        
        top.position.y = (height/2) + 0.6
        bottom.position.y = -(height/2) - 0.6
        bottom.rotation.x = Math.PI
        
        this.meshGroup.add(body, top, bottom)

        // Enhanced Internal Glitter - More planes for wider shape
        for(let i=0; i<15; i++) {
            const g = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.2), new THREE.MeshStandardMaterial({ 
                color: 0xffffff, metalness: 1, roughness: 0, emissive: 0xffffff, emissiveIntensity: 3, side: THREE.DoubleSide, transparent: true, opacity: 0.7
            }))
            g.position.set((Math.random()-0.5)*radius*1.5, (Math.random()-0.5)*height, (Math.random()-0.5)*radius*1.5)
            g.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0)
            this.meshGroup.add(g)
        }
    }
    getFragmentPalette() { return [0xff00cc, 0xffaa00, 0xffffff] } // Pink, Golden, Sparkle
    getFragmentGeo(s) { return new THREE.TetrahedronGeometry(s) }
}

// 🔋 Aurora Nebula Orb
class PlasmaObject extends ZenObject {
    build() {
        this.meshGroup.scale.setScalar(1.2)
        
        const core = new THREE.Mesh(
            new THREE.SphereGeometry(1.6, 64, 64),
            new THREE.MeshStandardMaterial({ color: 0x001133, emissive: 0x0055ff, emissiveIntensity: 4, metalness: 1, roughness: 0 })
        )
        this.meshGroup.add(core)
        
        // Nebula layers
        this.layers = []
        for(let i=0; i<2; i++) {
            const layer = new THREE.Mesh(
                new THREE.SphereGeometry(1.65 + i*0.05, 32, 32),
                new THREE.MeshStandardMaterial({
                    color: 0x00ffee,
                    emissive: 0x00ffee,
                    emissiveIntensity: 1,
                    transparent: true,
                    opacity: 0.3,
                    wireframe: true
                })
            )
            this.meshGroup.add(layer)
            this.layers.push(layer)
        }

        // Stellar Dust - NOW INSIDE MESHGROUP to follow bobbing
        this.dust = []
        for(let i=0; i<45; i++) {
            const d = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshStandardMaterial({ 
                color: 0x00ffee, emissive: 0x00ffee, emissiveIntensity: 4
            }))
            const r = 2.5 + Math.random()*1.5
            const a = Math.random()*Math.PI*2
            const b = Math.random()*Math.PI*2
            d.position.set(Math.cos(a)*r, Math.sin(b)*r, Math.sin(a)*r)
            d.userData = { orbit: 0.01 + Math.random()*0.02, axis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize() }
            this.meshGroup.add(d)
            this.dust.push(d)
        }
    }
    shatter(pos) {
        // Special: include dust positions in explosion
        const dustPositions = this.dust.map(d => {
            const worldPos = new THREE.Vector3()
            d.getWorldPosition(worldPos)
            return worldPos
        })
        
        super.shatter(pos)
        
        // Add extra fragments for each dust particle
        dustPositions.forEach(dp => {
            const size = 0.1
            const fragMat = new THREE.MeshPhysicalMaterial({
                color: 0x00ffee,
                emissive: 0x00ffee,
                emissiveIntensity: 5,
                metalness: 0.5,
                roughness: 0,
                transparent: true,
                opacity: 1.0
            })
            const p = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), fragMat)
            p.position.copy(dp)
            p.userData = { 
                vel: dp.clone().sub(pos).normalize().multiplyScalar(0.6 + Math.random()*0.5),
                rot: new THREE.Vector3(Math.random()*0.2, Math.random()*0.2, Math.random()*0.2),
                life: 1.0,
                stayHome: 2.5 
            }
            this.group.add(p)
            this.particles.push(p)
        })
    }
    animate() {
        this.layers.forEach((l, i) => {
            l.rotation.y += 0.02 * (i+1)
            l.rotation.z -= 0.015 * (i+1)
        })
        this.dust.forEach(d => {
            d.position.applyAxisAngle(d.userData.axis, d.userData.orbit)
        })
    }
    getFragmentPalette() { return [0x001133, 0x00ffee, 0xffffff] } // Deep blue, Cyan aurora, Star dust
    getFragmentGeo(s) { return new THREE.SphereGeometry(s, 8, 8) }
}

// --- App Control ---
class App {
    constructor() {
        this.world = new World(document.getElementById('canvas-container'))
        this.world.setupEnvironment()
        this.world.setupControls()
        
        this.objects = {
            crystal: new CrystalObject(this.world),
            tech: new TechObject(this.world),
            plasma: new PlasmaObject(this.world)
        }
        
        this.currentMode = 'crystal'
        this.setupUI()
        this.setMode('crystal')
        this.loop()
    }
    setMode(mode) {
        Object.values(this.objects).forEach(o => o.group.visible = false)
        this.currentMode = mode
        this.objects[mode].group.visible = true
        this.objects[mode].reset()
        
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'))
        const activeBtn = document.querySelector(`[data-mode="${mode}"]`)
        if(activeBtn) activeBtn.classList.add('active')
    }
    setupUI() {
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setMode(btn.dataset.mode))
        })
        window.addEventListener('mousedown', (e) => {
            if (e.target.closest('.hud-bottom') || e.target.closest('.status-bar') || e.target.closest('.ui-container')) return
            sounds.resume()
            this.objects[this.currentMode].onClick(e.clientX, e.clientY)
            const hint = document.getElementById('hint')
            if(hint) hint.style.display = 'none'
        })
    }
    loop() {
        requestAnimationFrame(() => this.loop())
        this.world.render()
        if (this.objects[this.currentMode]) this.objects[this.currentMode].update()
    }
}

window.addEventListener('DOMContentLoaded', () => { 
    try { new App(); console.log("ZenBurst EXTREME Initialized"); } catch (e) { console.error(e); }
})
